---
title: Connected Stock Model — Station-as-Warehouse (W1, foundation)
date: 2026-06-29
status: draft — awaiting CEO approval (Socratic-gate)
owner: tech-lead
project: admin-panel
initiative_mc: 8b709aa0-ae06-4685-872e-46bcea0a4754   # epic: procurement
mc_task: c605e2ca-828a-466f-8c1f-0bd68f4bd6ac           # driver: Connected stock model
branch: feature/admin/connected-stock-model-spec
depends_on_pr: os#427                                    # RAW par/reorder backbone (applied to prod, not yet in main)
context: >
  W1 of the Procurement epic. Designs the station-aware ("station = warehouse")
  stock model in the Syrve/iiko style. PAPER ONLY — no code, no migrations, no
  edge-fn deploy until CEO approves. The 3 open questions at the end are gated
  decisions for the CEO.
---

> **MC Task:** `c605e2ca-828a-466f-8c1f-0bd68f4bd6ac`
> **Epic:** `procurement` (`8b709aa0`) · **Workstream:** W1 (foundation)
> **Priority:** high · **Domain:** tech · **Project:** admin-panel
> **Gate:** RULE-SOCRATIC-GATE — this is a design spec. Nothing ships until the CEO
> answers §10 and approves. No `apply_migration`, no edge-fn deploy in this task.

---

## 0. TL;DR

The CEO asked for a **connected stock model**: stock is counted at L1 (kitchen) and
L2 (assembly) via the Telegram bot *and* the admin panel, and every count flows to an
action — RAW runs low → shopping list → PO; a PF (e.g. cooked chicken at the salad
station) runs low → L1 gets a production task. Stock must be **station-aware**: each
station is a warehouse (склад); production consumes one warehouse and produces into
another; internal transfers move PF from L1→L2; per-warehouse min-stock triggers a
**purchase** (RAW) or a **production** (PF).

**The decisive finding of this audit:** ~70% of this model **already exists on prod**,
unreconciled and station-blind. We are not building greenfield — we are **reconciling
three on-hand representations into one station-aware truth** and **wiring up dormant
tables that already exist** (`stock_transfers`, `stock_requests`, `production_orders`).
This is the cheapest path to the CEO's "no orphan/unlinked tables" mandate, and it
honours RULE-MINIMAL-CORRECT-CHANGE.

This spec maps what exists, names the one real architectural fork (per-station vs global
on-hand), sketches the target schema/views/RPCs as **migrations on paper**, and ends
with the 3 CEO decisions that unblock implementation.

---

## 1. Ground truth — what is ACTUALLY on prod (audited 2026-06-29)

The CEO brief and prior memory were partly stale. Verified against prod
(`qcqgtcsjoacuktcewpvo`) on 2026-06-29:

### 1.1 The three on-hand representations (the split-brain)

| Store | Rows | Grain | Station-aware? | Written by | Read by |
|---|---|---|---|---|---|
| **`sku_balances`** | 266 | one qty per `nomenclature_id` (+`sku_id`) | ❌ global | `fn_approve_po` (receiving), admin Stocktake UI (`upsertBalance`) | admin `useInventory`, `v_stock_status`, `v_inventory_by_nomenclature` |
| **`inventory_batches`** | 101 | one row per physical batch: `weight`, `location_id`, `expires_at`, `status` | ✅ **has `location_id`** | production / receiving flows (FIFO, HACCP) | `v_stock_status` (counts batches only), expiry surfaces |
| **`stock_movements`** | 833 | append-only delta ledger: `qty_delta`, `reason`, `order_id` | ❌ global (no location) | POS sales depletion (order-driven) | `v_stock_status` (`consumed_since_count`) |

**No trigger/fn/view bridges these three.** The only trigger on any of them is
`trg_tasks_updated` (a touch-`updated_at` on `production_tasks`). So today:
- `sku_balances` = the snapshot the admin treats as on-hand.
- `inventory_batches` = the batch truth (and the *only* place with a location dimension).
- `stock_movements` = perpetual deltas from sales.

They drift independently → latent split-brain. This is the core problem W1 solves.

### 1.2 `v_stock_status` is MORE advanced than the brief claimed

The brief said v_stock_status is "RAW-only". **False.** The live definition:
- Computes `on_hand` from `sku_balances` (global).
- Computes `consumed_since_count` from `stock_movements` since `last_counted_at` →
  derives **`theoretical_on_hand`** (a real perpetual-inventory figure).
- Joins `inventory_batches` for `live_batches`, `next_expiry`, `expiring_soon`, `expired`.
- Computes `suggested_qty` + `stock_status` ∈ {`out`,`low`,`ok`,`untracked`}.
- **Covers `raw_ingredient`, `semi_finished` (PF!), AND `good`** — gated on
  `min_stock IS NOT NULL OR in_stock_sheet = true`. PF preps with a `min_stock` set are
  ALREADY in the reorder view.

So "extend par to PF" (old W3) is **half-done**: the view already admits PF; what's
missing is (a) the station dimension and (b) routing low-PF to production instead of a PO.

### 1.3 `nomenclature` already carries par levels — but GLOBAL

`nomenclature` has: `min_stock`, `par_stock`, `reorder_qty` (the os#427 backbone),
`stock_state` (text cache), `storage_location` (free text, **not** an FK to `locations`),
`storage_type`, `shelf_life_days`, `in_stock_sheet`, `base_unit`. **All single-valued per
sku** — there is no per-station par today. This is what makes Question (a) a real schema fork.

### 1.4 `locations` exists but is COARSE

`locations` = 3 rows: **Kitchen** (`kitchen`), **Assembly** (`assembly`),
**Storage** (`storage`). Enum `location_type` also has `delivery` (unused).
- This is the **L1 = Kitchen, L2 = Assembly, raw store = Storage** mapping.
- It does **NOT** model the CEO's fine taxonomy (Assembly → Drinks · Hot · Salads/bowls
  · Dips · Packaging; Kitchen → roast veg · dips · proteins · sauerkraut). Decision §10-D:
  do we keep 3 coarse warehouses for v1 or add sub-stations now?

### 1.5 Dormant tables that ALREADY model the missing pieces (0 rows)

These exist on prod with sensible columns but no live data — they are the "orphans" the
CEO wants wired up, not new tables to invent:

| Table | Shape | What it's for |
|---|---|---|
| **`stock_transfers`** | `batch_id`, `from_location`, `to_location`, `transferred_by`, `transferred_at` | **L1→L2 internal transfer** (перемещение) at batch grain. Exactly the CEO's "move PF to assembly". |
| **`stock_requests`** / **`stock_request_lines`** | request header + lines (`nomenclature_id`, `order_qty`, `status`) | The os#427 shopping-list → draft-PO bridge (RAW reorder request). |
| **`production_orders`** | `order_number`, `nomenclature_id`, `target_qty`, `deadline_at`, `raw_requirements` jsonb, `status`, `assigned_to`, waste fields | **Production demand** — a "make N kg of PF X by deadline" order. The natural home for "PF low → produce". |
| **`production_task_outputs`**, **`production_log`** | output + audit | Records what a production run actually yielded (→ creates `inventory_batches`). |

`batch_status` enum already supports the full lifecycle:
`sealed → opened → depleted → wasted → produced → in_transit → expired`
(`in_transit` is literally the transfer state; `produced` the post-cook state.)

### 1.6 LIVE production substrate

`production_tasks` = 82 rows (the Merrychef/manakish scheduler: `target_nomenclature_id`,
`target_quantity`, `order_id`, `theoretical_bom_snapshot`, `equipment_id`,
`assigned_tg_user_id`, `depends_on_task_id`, batching). `production_plans` (1),
`production_targets` (3). Production is a real, used subsystem — low-PF routing should
**emit into it**, not parallel it.

### 1.7 The Telegram count log

`stocktake_entries` (mig 316) = 0 rows. Bot's append-only count log:
`nomenclature_id`, `counted_qty`, `unit`, `station` (text, default `'general'`),
`counted_by`, `source_text`, `session_id`, `status`. Surfaced by `v_stock_latest`
(latest confirmed count per `nomenclature_id`+`station`). **Not dead — dropping it breaks
the bot.** It already has a free-text `station` column — but it does NOT write any balance.
No bridge to `sku_balances` or `inventory_batches`. This is the W2 gap.

---

## 2. Target model (Syrve/iiko mapped onto what we have)

Syrve's primitives and their Shishka home:

| Syrve concept | Shishka implementation (target) |
|---|---|
| Warehouse (склад) | `locations` row (Kitchen / Assembly / Storage [/ sub-stations]) |
| Stock on hand per warehouse | **derived** `v_stock_on_hand` = Σ `inventory_batches.weight` per `(nomenclature_id, location_id)` where `status ∈ {sealed,opened,produced}` |
| Production / cooking act | `production_orders` → `production_tasks` → on completion: consume input batches + **insert output `inventory_batches`** at the producing location |
| Internal transfer (перемещение) | `stock_transfers` (batch moves `from_location`→`to_location`; batch flips to `in_transit` then lands) |
| Goods receipt (приход) | `fn_approve_po` → insert `inventory_batches` at Storage (today it bumps `sku_balances`; target: it also/instead creates a batch) |
| Write-off / waste (списание) | batch → `wasted`/`expired`; `stock_movements` delta with `reason` |
| Inventory count (инвентаризация) | bot `stocktake_entries` + admin Stocktake → **reconcile** to the per-station truth |
| Min-stock → replenishment | per `(nomenclature, location)`: RAW → `stock_requests` (purchase); PF → `production_orders` (produce) |

**Design principle — one truth, two reads.** Pick `inventory_batches` as the **physical
source of truth** (it is the only station-aware, expiry-aware, FIFO-correct store).
Everything else becomes a *projection* or an *adjustment*:
- `v_stock_on_hand_by_location` (NEW) = Σ live batch weight per (sku, location).
- `sku_balances` is **demoted** to a derived/compatibility view OR kept as a manual
  adjustment layer reconciled against batches (Question (c) decides which).
- `stock_movements` stays the **sales-depletion ledger** that decrements batches (FIFO)
  rather than a separate global number.

This keeps the CEO's mental model exact: *count a station → see that station's stock →
act on that station's shortfall.*

---

## 3. Per-station stock (the on-hand view)

### 3.1 New derived view — `v_stock_on_hand_by_location` (paper)

```sql
-- PAPER ONLY — not applied.
CREATE VIEW v_stock_on_hand_by_location AS
SELECT
  b.nomenclature_id,
  b.location_id,
  l.name                              AS location_name,
  l.type                              AS location_type,
  SUM(b.weight)                       AS on_hand,
  COUNT(*)                            AS live_batches,
  MIN(b.expires_at)                   AS next_expiry,
  COUNT(*) FILTER (WHERE b.expires_at <= now() + interval '2 days') AS expiring_soon
FROM inventory_batches b
JOIN locations l ON l.id = b.location_id
WHERE b.status = ANY (ARRAY['sealed','opened','produced']::batch_status[])
GROUP BY b.nomenclature_id, b.location_id, l.name, l.type;
```

This is the foundation primitive: **"how much of X sits at station Y, right now."**
Zero new tables — it reads the batch store that already has 101 live rows.

### 3.2 Station-aware reorder/production view — `v_station_replenishment` (paper)

Extends `v_stock_status` with the location dimension and the **purchase-vs-produce**
verdict per station:

```sql
-- PAPER ONLY — not applied. Conceptual shape.
CREATE VIEW v_station_replenishment AS
SELECT
  n.id                  AS nomenclature_id,
  n.product_code,
  n.type,                                   -- raw_ingredient | semi_finished | good
  oh.location_id,
  oh.location_name,
  COALESCE(oh.on_hand, 0)               AS on_hand,
  par.min_stock,                            -- §10-A: from station_par OR nomenclature
  par.par_stock,
  par.reorder_qty,
  CASE
    WHEN par.min_stock IS NULL THEN 'untracked'
    WHEN COALESCE(oh.on_hand,0) <= 0          THEN 'out'
    WHEN COALESCE(oh.on_hand,0) <= par.min_stock THEN 'low'
    ELSE 'ok'
  END                                   AS stock_status,
  GREATEST(COALESCE(par.par_stock, par.min_stock) - COALESCE(oh.on_hand,0), 0) AS suggested_qty,
  CASE
    WHEN n.type = 'raw_ingredient' THEN 'purchase'   -- → stock_requests → PO
    ELSE 'produce'                                    -- PF/good → production_orders → L1
  END                                   AS replenish_action
FROM nomenclature n
JOIN <par source> par ON par.nomenclature_id = n.id      -- §10-A
LEFT JOIN v_stock_on_hand_by_location oh ON oh.nomenclature_id = n.id
WHERE COALESCE(n.is_deleted,false) = false;
```

The single new idea here is `replenish_action` — the routing fork (RAW→purchase,
PF→produce) the CEO described as "a button: to-purchase OR to-prep-at-L1."

---

## 4. Recording counts — bot AND admin → one model

Both count entry points must land in the **same** per-station truth. Proposed flow
(decoupling the audit log from the balance write):

```
Telegram bot  ─┐
               ├─►  stocktake_entries  (append-only AUDIT log: who/when/station/raw-text)
Admin Stocktake┘            │
                            ▼
                   fn_apply_stocktake(entry)         ← NEW RPC (paper)
                            │  reconciles counted_qty against
                            │  v_stock_on_hand_by_location for (sku, station)
                            ▼
        writes an ADJUSTMENT so batch-derived on-hand == counted qty
        (e.g. close/shrink batches, or post a count-adjustment stock_movements row
         tagged reason='stocktake', location-scoped)
```

Key points:
- `stocktake_entries` stays as the immutable **audit log** (CEO's "no orphan tables":
  it gains a consumer — `fn_apply_stocktake` — instead of dangling).
- `stocktake_entries.station` (text) must resolve to a `locations.id`. v1: a small
  lookup map (`'l1'|'kitchen'→Kitchen`, `'l2'|'assembly'→Assembly`, `'storage'→Storage`);
  v2: bot sends `location_id`. (See §10-D if sub-stations are added.)
- Admin Stocktake UI (`upsertBalance`) is repointed at the same RPC so both paths agree.
- **Bot side needs an edge-fn deploy → CEO-only.** This spec does not deploy.

### 4.1 Reconciliation semantics (Question (c) territory)

Counting is an **assertion of physical truth** that overrides the system. Two ways to
honour it against a batch-grained model:
1. **Adjustment-row** (recommended): keep batches intact, post a single
   `stock_movements` delta `reason='stocktake_adj'` carrying `location_id` so the
   per-station derived on-hand reconciles to the count. Auditable, reversible, FIFO-safe.
2. **Batch rewrite**: open/shrink/close individual batches to match — more precise for
   expiry but heavier and error-prone for a phone count.

This requires `stock_movements` to gain a nullable `location_id` (§5). v1 recommends #1.

---

## 5. Data sketch — migrations ON PAPER (nothing applied)

> Naming/au­dit per RULE-MIGRATION-TRACKING (each migration self-registers into
> `migration_log` with `checksum=NULL`). Numbers TBD at apply time (current head ~325+;
> os#427 must merge first to clear the dup-317 drift — see §9).

| # | Migration (paper) | What it does | Risk |
|---|---|---|---|
| M1 | `add_location_to_stock_movements.sql` | `ALTER TABLE stock_movements ADD COLUMN location_id uuid REFERENCES locations(id)` (nullable; backfill NULL = legacy global). Enables station-scoped adjustments & depletion. | low (additive) |
| M2 | `view_stock_on_hand_by_location.sql` | `CREATE VIEW v_stock_on_hand_by_location` (§3.1). | low (read-only) |
| M3 | `station_par.sql` | **IF §10-A = per-station:** `CREATE TABLE station_par (nomenclature_id uuid, location_id uuid, min_stock numeric, par_stock numeric, reorder_qty numeric, PRIMARY KEY (nomenclature_id, location_id))`. **IF global:** skip — reuse `nomenclature.min_stock`. | low |
| M4 | `view_station_replenishment.sql` | `CREATE VIEW v_station_replenishment` (§3.2) with the par source from M3/§10-A. | low |
| M5 | `fn_apply_stocktake.sql` | RPC: given a `stocktake_entries` row (or admin count), resolve station→location, write the reconciling adjustment (§4.1). SECURITY DEFINER, validate caller. | med (writes stock) |
| M6 | `fn_replenish_from_station.sql` | RPC behind the CEO's button: for a `(nomenclature, location, qty)` shortfall, if RAW → upsert a `stock_requests`/`stock_request_lines` row; if PF → insert a `production_orders` row at the producing location (§10-B decides auto vs suggest). | med |
| M7 | `fn_transfer_batch.sql` | RPC wrapping `stock_transfers`: move a batch `from_location→to_location`, flip `status` through `in_transit`. (Wires the dormant table.) | low |
| M8 | `production_completion_creates_batch.sql` | On `production_tasks`/`production_orders` completion: consume input batches (FIFO) + insert output `inventory_batches` at the producing location + `production_task_outputs`/`production_log`. Closes the production→stock loop. | med |

**No table is invented that doesn't already exist** except the optional `station_par`
(only if §10-A chooses per-station) — everything else is a view, an additive column, or an
RPC that animates a dormant table. That is the whole point of W1.

### 5.1 What we explicitly do NOT do
- Do **not** drop `stocktake_entries` (breaks the bot).
- Do **not** drop `sku_balances` in this phase — demote it via view/adjustment only after
  §10-C is decided and the batch-derived truth is validated against it in parallel
  (run both, diff, then cut over).
- Do **not** add the fine sub-station taxonomy unless §10-D says so.

---

## 6. End-to-end flows (the CEO's two worked examples)

**A) Smoothie station low on mango (RAW):**
```
count at Assembly (bot/admin) → stocktake_entries(station=assembly)
 → fn_apply_stocktake → v_stock_on_hand_by_location(mango, Assembly) updated
 → v_station_replenishment: status='low', replenish_action='purchase'
 → CEO/Mint hits button → fn_replenish_from_station
 → stock_requests line (mango, qty) → existing shopping-list → draft PO (os#427)
```

**B) Salad station out of cooked chicken (PF):**
```
count at Assembly → stocktake_entries(station=assembly)
 → fn_apply_stocktake → on_hand(cooked_chicken, Assembly) ≈ 0
 → v_station_replenishment: status='out', replenish_action='produce'
 → fn_replenish_from_station → production_orders(cooked_chicken, target_qty, deadline, at Kitchen)
 → L1 picks up (production_tasks / KDS — W6) → on completion: M8 inserts batch at Kitchen
 → stock_transfers moves batch Kitchen→Assembly (M7) → Assembly on_hand restored
```

Both flows touch **only existing tables** plus the new views/RPCs. No orphan ends.

---

## 7. Scope of W1 vs the rest of the epic

| WS | Title | In THIS spec? |
|---|---|---|
| **W1** | Per-station stock model (this doc) | ✅ design only |
| W2 | Bridge bot+admin counts → store (`fn_apply_stocktake`) | designed here (§4), built after approval; **edge-fn deploy = CEO** |
| W3 | PF par per station + low→L1 production | designed here (§3.2, §5 M3/M6); build after §10-A/B |
| W4 | RAW low → shopping list → PO | **exists** (os#427); we just feed it station-aware requests |
| W5 | Mint price intelligence (`7a9b0478`) | out of scope |
| W6 | L1 production KDS + capacity (`cc7f6161`) | out of scope (consumes `production_orders` we emit) |

Build-vs-buy (Syrve vs StoreHub, `4f144895`) sits above this: if the CEO buys Syrve,
this model is the **migration target shape**; if we build, it's the build spec. Either way
W1's audit (the three-store reconciliation) is the prerequisite truth.

---

## 8. Risks & invariants

- **Unit integrity.** `inventory_batches.weight` and counts must be in each sku's
  `base_unit`. Mixed units (pcs vs kg) across batch/count/par will silently corrupt
  on-hand. `fn_apply_stocktake` must assert unit == `nomenclature.base_unit`.
- **RAW lives in Storage, not a "station".** RAW on-hand is at Storage; the station that
  *consumes* RAW (e.g. Assembly using mango) may not stock it as a batch. Decide whether
  "smoothie station low on mango" means *Storage* low or *Assembly* working-stock low.
  (Likely: RAW reorder keys off Storage; PF/working-stock keys off the consuming station.)
- **Double-count.** Once batches are the truth, a manual `sku_balances` edit and a batch
  both claiming the same stock = double count. Hence the staged demotion of `sku_balances`
  (§5.1) with a parallel-run diff before cutover.
- **RLS.** All new RPCs are SECURITY DEFINER, validate the JWT, and are writable by
  authenticated staff only (per existing flat-RLS reality — `gotcha_rls_authenticated_not_role_gated`).

---

## 9. Sequencing / dependencies

1. **Merge os#427 into main first** (session `d08d44a8`). It carries the RAW par/reorder
   backbone and the `stock_requests` bridge; merging clears the duplicate-mig-317 CI red and
   aligns main↔prod. W1 builds on top. *(External dependency — not done in this task.)*
2. CEO answers §10.
3. Implement M1–M2 (additive, safe) → validate `v_stock_on_hand_by_location` against the
   101 live batches.
4. Implement M5 + repoint both count paths (W2). Deploy bot edge-fn (**CEO**).
5. Implement M3/M4/M6 (W3) per §10-A/B.
6. M7/M8 close the production+transfer loop.

---

## 10. CEO decisions (Socratic-gate — implementation blocked until answered)

**(A) PF par levels — per station, or global per PF?**
- *Global* (cheapest): reuse `nomenclature.min_stock/par_stock/reorder_qty` as-is. One
  number per PF regardless of where it sits. Simple, but can't say "keep 3kg chicken at
  Assembly AND 5kg buffer at Kitchen."
- *Per station* (Syrve-true): new `station_par(nomenclature_id, location_id, …)` (M3).
  Models real kitchens; more rows to maintain. **Recommendation: per-station, but only for
  the few PFs that live in two places** — fall back to the global `nomenclature` value when
  no station row exists (hybrid; cheap to start, scales).

**(B) PF low → auto-create the L1 production task, or suggest-and-approve?**
- *Auto*: `v_station_replenishment` status='low' immediately inserts a `production_orders`
  row. Fast, but can spam L1 if counts are noisy.
- *Suggest-and-approve* (recommended for v1): low-PF surfaces as a **suggestion** on the
  station dashboard; CEO/cook confirms → `fn_replenish_from_station` creates the order. The
  CEO's own framing was "a button" → that is suggest-and-approve. Promote to auto later once
  counts are trusted.

**(C) Counts — adopt the new per-station model, or keep global `sku_balances`?**
- The model needs a station-aware truth; `sku_balances` is global and can't provide it.
- *Recommendation:* make **`inventory_batches` the physical source of truth** and derive
  per-station on-hand (§3). **Keep `sku_balances` running in parallel** for one phase as a
  reconciliation check (diff batch-derived vs `sku_balances` for the 266 tracked skus); once
  they agree within tolerance, demote `sku_balances` to a derived/compat view. Counts write
  adjustments (§4.1), not a second global number. This is the "no split-brain" answer.

**(D) [surfaced by audit] Station granularity for v1 — 3 coarse warehouses or sub-stations now?**
- Today `locations` = Kitchen / Assembly / Storage. The CEO's taxonomy wants Assembly split
  into Drinks/Hot/Salads/Dips/Packaging and Kitchen into roast/dips/proteins/sauerkraut.
- *Recommendation:* ship v1 on the **3 coarse warehouses** (they already exist and cover both
  worked examples), add sub-stations as more `locations` rows in a fast-follow once the chef
  finalises the L1-vs-L2 prep split (the open chef question). Adding a `locations` row is
  zero-migration; no schema change is blocked by deferring this.

---

## 11. Acceptance criteria for THIS task (spec deliverable)

- [x] Spec committed to a feature branch at `docs/projects/admin/plans/spec-connected-stock-model.md`.
- [x] Linked to MC `c605e2ca` via `related_ids.spec_file` + a pointer comment.
- [x] Covers: station-as-warehouse, per-station on-hand, L1→L2 transfers, min-stock →
      purchase(RAW) | production(PF), counts from bot AND admin, data sketch
      (tables/views/RPCs + paper migrations).
- [x] 3 (+1) decisions framed as CEO-gated questions (§10).
- [ ] **CEO approves §10** → unblocks W2/W3 implementation. *(awaiting)*

> No code, no migration, no deploy was performed for this task (Socratic-gate honoured).
