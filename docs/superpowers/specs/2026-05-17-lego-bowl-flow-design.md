# Lego/Bowl Dish Flow — Phase 1 + KDS Data Layer (Design Spec)

**Date:** 2026-05-17
**Status:** Approved — ready for implementation
**Author:** Claude (session `claude-opus-session-55e0a692`) with CEO (Lesia)
**MC task:** `3f051d79-2545-43ab-8323-261911c28ef4` — "Lego/bowl dish flow — POS order → Assembly KDS (design only)"
**Companion spec:** [`2026-05-17-menu-card-full-design.md`](2026-05-17-menu-card-full-design.md) (Phase 3 shipped 2026-05-17, PR #215)
**Companion ops doc:** [`docs/operations/loyverse-dashboard-conventions.md`](../../operations/loyverse-dashboard-conventions.md) (new, created with this spec)

## 1. Context

Menu Card Phase 3 (PR #215, merged 2026-05-17) ships the static-dish admin surface — owner editing, 4-view toggle, photo upload, Loyverse push. It does **not** cover lego/bowl dishes where the customer composes the order from a slot menu (base + protein + greens + topping + sauce). Three pieces are missing:

1. **Slot abstraction on modifier options.** `nomenclature_modifier_options` exists (mig 183) but has no slot tag, no PF-binding quantity, no Loyverse-id link.
2. **Receipt-driven order persistence.** Loyverse holds the order; admin-panel doesn't ingest it. Without persisted `order_item_modifiers`, neither BOM deduction (T5) nor `/kds/assembly` (T8) can work for lego.
3. **Loyverse modifier_lists ↔ admin-panel mapping.** CEO will run modifier_lists from Loyverse Dashboard during Phase 1 launch; admin-panel must pull them and bind each option to internal MOD-* nomenclature + slot + quantity.

L2 opens ~2026-06-15 with lego dishes day-1, so this lands before launch. CEO ratified Phase 1 = Loyverse KDS as assembly surface (POS system map v1.0, 2026-05-15). This spec produces the data layer that lego needs at launch AND that the Phase 2 admin-panel `/kds/assembly` route (T8) will consume after the inventory-match gate.

## 2. Decisions Locked

| # | Decision | Value |
|---|---|---|
| D-1 | Lego live on L2 launch day | Yes — must work ~2026-06-15 |
| D-2 | Slot schema | Universal enum: `base / protein / greens / topping / sauce` |
| D-3 | Merrychef signal | Per-dish, derived from `nomenclature.merrychef_program IS NOT NULL` (no new column) |
| D-4 | SSoT during Phase 1 | Loyverse Dashboard owns modifier_lists; admin-panel mirrors + adds meta (slot, MOD, qty) |
| D-5 | SSoT in Phase 2 | admin-panel becomes canonical; push to Loyverse; one-shot migration described in §7 |
| D-6 | Spec scope | M1 (data) + M2 (Loyverse pull + mapping UI) + M4 (order persistence). M3 → T5, M5 → T8 |
| D-7 | Slot vocab migration | `bom_structures.slot` CHECK swap from `(base/protein/finish/accent/dressing)` to D-2 vocab. Zero-data migration (all NULL today). Menu-card spec §4.6 updated. |

## 3. Out of Scope

| Item | Where it lives | Why deferred |
|---|---|---|
| Loyverse `receipts.create` webhook HTTP listener | T5 (separate MC task, in roadmap) | Generic to static + lego; needs full webhook lifecycle |
| BOM deduction triggered by webhook | T5 | Existing BOM walk; T5 wires it to the ingest RPC defined here |
| `/kds/assembly` UI route | T8 (separate MC task) | 4–6 weeks of frontend; needs separate UX design pass |
| Merrychef timer per-order, batch-open scan, HACCP CCP checklist | T8 | KDS UX scope |
| Grab Partner API ingest | T9 (Phase 2+) | After L2 launch |
| Per-role RLS on `/menu/modifiers` | Blocked on MC `6e4b56bf` (User Management UI) | Cross-cutting auth task |
| Phase 2 SSoT flip (`push_modifier_list` action) | Future Phase 2 sprint | Migration path described in §7 but not built here |

## 4. Module M1 — Data Model (3 migrations)

### 4.1 — Slot vocab swap on `bom_structures`

File: `services/supabase/migrations/192_lego_slot_vocab_swap.sql`

```sql
ALTER TABLE bom_structures DROP CONSTRAINT bom_structures_slot_check;
ALTER TABLE bom_structures ADD CONSTRAINT bom_structures_slot_check
  CHECK (slot IS NULL OR slot IN ('base','protein','greens','topping','sauce'));
```

Plus inline edit to [`2026-05-17-menu-card-full-design.md`](2026-05-17-menu-card-full-design.md) §4.6 — replace the old vocabulary listing with the new five and note the swap in the §History section.

**Safety:** verified no rows have non-NULL `slot` today (explore agent, mig 124 seed leaves slot blank). No data rewrite.

### 4.2 — Extend `nomenclature_modifier_options`

File: `services/supabase/migrations/193_modifier_options_lego_extension.sql`

```sql
ALTER TABLE nomenclature_modifier_options
  ADD COLUMN slot TEXT
    CHECK (slot IS NULL OR slot IN ('base','protein','greens','topping','sauce')),
  ADD COLUMN quantity_per_unit NUMERIC NOT NULL DEFAULT 1
    CHECK (quantity_per_unit > 0),
  ADD COLUMN loyverse_modifier_id TEXT,
  ADD COLUMN loyverse_modifier_list_id TEXT,
  ADD COLUMN loyverse_modifier_list_name TEXT;

CREATE UNIQUE INDEX idx_nomod_loyverse_modifier_id
  ON nomenclature_modifier_options (loyverse_modifier_id)
  WHERE loyverse_modifier_id IS NOT NULL;
```

**Column rationale:**
- `slot` — groups options in Loyverse modifier_lists (Phase 1) and KDS card (Phase 2)
- `quantity_per_unit` — how much MOD-* applies per order unit; multiplied with receipt qty at BOM time
- `loyverse_modifier_id` — Loyverse internal option id, joined against `receipt.line.modifiers[].id`
- `loyverse_modifier_list_id` — Loyverse list this option belongs to (slot dimension)
- `loyverse_modifier_list_name` — snapshot for audit if CEO renames in Dashboard

### 4.3 — Raw Loyverse mirror tables

File: `services/supabase/migrations/194_pos_loyverse_modifier_mirror.sql`

```sql
CREATE TABLE pos_loyverse_modifier_lists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  min_select INT,
  max_select INT,
  raw JSONB NOT NULL,
  pulled_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE pos_loyverse_modifier_options (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL REFERENCES pos_loyverse_modifier_lists(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC,
  raw JSONB NOT NULL,
  pulled_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pos_loyverse_options_list ON pos_loyverse_modifier_options(list_id);
```

These are read-mirror only — fully refreshed on each pull (TRUNCATE+INSERT in a transaction). They expose raw Loyverse data so CEO can pick what to bind.

## 5. Module M2 — Loyverse Pull + Mapping UI

### 5.1 — Edge Function `pull_modifiers` action

File: [`services/supabase/functions/loyverse-sync/index.ts`](../../../services/supabase/functions/loyverse-sync/index.ts) (extend existing — current actions: `status`, `categories`, `items`, `full`, `push_dish`)

Add:

```typescript
case 'pull_modifiers': {
  // 1. GET https://api.loyverse.com/v1.0/modifier_lists?limit=250
  // 2. Loyverse returns lists with embedded modifiers[] array
  // 3. TRUNCATE pos_loyverse_modifier_lists CASCADE
  // 4. INSERT all lists, then all options (CASCADE handles re-link)
  // 5. UPDATE nomenclature_modifier_options.loyverse_modifier_list_name
  //    where loyverse_modifier_id matches (refresh snapshots)
  // 6. Return { lists: N, options: M, warnings: [list names not matching slot vocab] }
  // 7. Log to pos_sync_log
}
```

**Loyverse contract:** `GET /v1.0/modifier_lists` returns all lists with options. Available since CEO unlocked trial 2026-05-14. Rate limit 60 req/min — one retry after 60s on 429, then fail.

Triggered on-demand from admin UI; no cron in Phase 1.

### 5.2 — Admin UI `/menu/modifiers` route

New files:
- `apps/admin-panel/src/pages/menu/ModifiersPage.tsx`
- `apps/admin-panel/src/hooks/useModifierBindings.ts`
- `apps/admin-panel/src/hooks/useLoyverseModifierPull.ts`

Wire-up edits:
- `apps/admin-panel/src/App.tsx` — add route `/menu/modifiers` → `<ModifiersPage />`
- `apps/admin-panel/src/layouts/AppShell.tsx` — sidebar entry under "Menu"

**Page layout:** three stacked sections.

1. **Header** — pull status (last pulled timestamp, item counts), `Pull now` button, warning chip for lists with non-canonical names.
2. **Pulled mirror (read-only)** — expandable accordion per Loyverse list showing options + price. Visual indicator: green check if list name lowercased matches a slot value, amber if not.
3. **Bindings table** — one row per `nomenclature_modifier_options` record:

   | dish (SALE-*) | Loyverse option | slot | MOD nomenclature | qty | edit/delete |

   `+ Add binding` opens inline form: dish autocomplete → Loyverse option autocomplete (filters to unbound options for picked dish) → slot dropdown (auto-filled from list name if match) → MOD autocomplete → qty input → save.

**Inline edit pattern:** reuse React 19 `useOptimistic` per OwnerTable (Phase 2 menu-card pattern). Save on blur or Enter, cancel on Escape. Validation: slot, MOD, qty mandatory before save.

**Read-only summary in DishDrawer:** menu-card Phase 3 DishDrawer (Owner view) gets a one-line summary `Configured modifiers: N → manage in /menu/modifiers`. No CRUD inside drawer. Exact file path resolved during implementation (DishDrawer Owner section in `apps/admin-panel/src/components/menu/drawer/`).

### 5.3 — Loyverse Dashboard naming convention

New file: `docs/operations/loyverse-dashboard-conventions.md`

Documents the contract: CEO names modifier_lists in Loyverse exactly one of `Base / Protein / Greens / Topping / Sauce` so the pull auto-fills `slot`. Other names are pulled and stored but require manual slot override in admin UI.

## 6. Module M4 — Order Persistence (read-model)

### 6.1+6.2 — Schema

File: `services/supabase/migrations/195_order_modifiers_persistence.sql`

```sql
ALTER TABLE orders
  ADD COLUMN loyverse_receipt_id TEXT UNIQUE,
  ADD COLUMN loyverse_raw JSONB,
  ADD COLUMN received_at TIMESTAMPTZ;

CREATE INDEX idx_orders_loyverse_receipt
  ON orders(loyverse_receipt_id) WHERE loyverse_receipt_id IS NOT NULL;

CREATE TABLE order_item_modifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  modifier_option_id UUID REFERENCES nomenclature_modifier_options(id) ON DELETE SET NULL,
  modifier_id UUID REFERENCES nomenclature(id) ON DELETE SET NULL,
  slot TEXT CHECK (slot IS NULL OR slot IN ('base','protein','greens','topping','sauce')),
  quantity NUMERIC NOT NULL DEFAULT 1 CHECK (quantity > 0),
  price_delta_paid NUMERIC NOT NULL DEFAULT 0,
  loyverse_modifier_id TEXT,
  loyverse_modifier_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_oim_order_item ON order_item_modifiers(order_item_id);
CREATE INDEX idx_oim_modifier ON order_item_modifiers(modifier_id) WHERE modifier_id IS NOT NULL;
CREATE INDEX idx_oim_slot ON order_item_modifiers(slot) WHERE slot IS NOT NULL;
```

**Reuses existing tables:** `orders` and `order_items` from migration 022. We only add provenance columns to `orders`; `order_items` is unchanged.

**Snapshot columns** (`loyverse_modifier_id`, `loyverse_modifier_name`) — preserved even when mapping is deleted, so historical orders remain readable.

### 6.3 — Ingest RPC

File: `services/supabase/migrations/196_fn_ingest_loyverse_receipt.sql`

```sql
CREATE OR REPLACE FUNCTION fn_ingest_loyverse_receipt(p_receipt JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_receipt_id TEXT := p_receipt->>'receipt_number';
  v_order_id UUID;
  v_line JSONB;
  v_mod JSONB;
  v_order_item_id UUID;
BEGIN
  SELECT id INTO v_order_id FROM orders WHERE loyverse_receipt_id = v_receipt_id;
  IF v_order_id IS NOT NULL THEN RETURN v_order_id; END IF;

  INSERT INTO orders (source, status, loyverse_receipt_id, loyverse_raw,
                      received_at, total_amount)
  VALUES ('loyverse', 'received', v_receipt_id, p_receipt, now(),
          (p_receipt->>'total_money')::numeric)
  RETURNING id INTO v_order_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_receipt->'line_items')
  LOOP
    INSERT INTO order_items (order_id, nomenclature_id, quantity, price_at_purchase)
    SELECT v_order_id, n.id, (v_line->>'quantity')::numeric,
           (v_line->>'price')::numeric
    FROM nomenclature n
    WHERE n.loyverse_item_id = v_line->>'item_id'
    RETURNING id INTO v_order_item_id;

    FOR v_mod IN SELECT * FROM jsonb_array_elements(
      COALESCE(v_line->'line_modifiers', '[]'::jsonb))
    LOOP
      INSERT INTO order_item_modifiers (
        order_item_id, modifier_option_id, modifier_id, slot,
        quantity, price_delta_paid,
        loyverse_modifier_id, loyverse_modifier_name
      )
      SELECT v_order_item_id, nmo.id, nmo.modifier_id, nmo.slot,
             COALESCE((v_mod->>'quantity')::numeric, 1),
             COALESCE((v_mod->>'total_price')::numeric, 0),
             v_mod->>'modifier_option_id',
             v_mod->>'name'
      FROM nomenclature_modifier_options nmo
      WHERE nmo.loyverse_modifier_id = v_mod->>'modifier_option_id'
      LIMIT 1;

      -- If mapping missing: row is still written with NULL modifier_option_id,
      -- modifier_id, slot — Loyverse snapshots preserved for backfill.
      IF NOT FOUND THEN
        INSERT INTO order_item_modifiers (
          order_item_id, quantity, price_delta_paid,
          loyverse_modifier_id, loyverse_modifier_name
        ) VALUES (
          v_order_item_id,
          COALESCE((v_mod->>'quantity')::numeric, 1),
          COALESCE((v_mod->>'total_price')::numeric, 0),
          v_mod->>'modifier_option_id',
          v_mod->>'name'
        );
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_order_id;
END;
$$;
```

T5 webhook handler calls this RPC with the full Loyverse payload. Idempotent on `receipt_number`.

## 7. Edge Cases Covered

| Scenario | Behavior |
|---|---|
| Loyverse list name not matching slot vocab | Pull stores raw; UI warning; CEO either renames in Loyverse or overrides slot per row |
| Option deleted in Loyverse Dashboard | Next pull removes from mirror; `nomenclature_modifier_options.loyverse_modifier_id` snapshot remains; UI flags orphan |
| Receipt with modifier missing admin mapping | RPC writes `order_item_modifiers` row with `modifier_id=NULL` + Loyverse snapshot; admin UI shows `N unmapped sales` badge; optional `fn_backfill_unmapped_order_modifiers()` re-resolves after CEO maps |
| Duplicate `receipt_number` | RPC returns existing `order_id`, no insert |
| Loyverse option name in Thai | Stored as-is in `loyverse_modifier_name`; CEO maps to MOD-* explicitly |
| Two Loyverse options with same name | Uniqueness is by `loyverse_modifier_id`, not name — safe |

## 8. Verification Plan

**Level 1 — migrations (M1, M4):**
```bash
psql "$DATABASE_URL" -f services/supabase/migrations/192_lego_slot_vocab_swap.sql
psql "$DATABASE_URL" -f services/supabase/migrations/193_modifier_options_lego_extension.sql
psql "$DATABASE_URL" -f services/supabase/migrations/194_pos_loyverse_modifier_mirror.sql
psql "$DATABASE_URL" -f services/supabase/migrations/195_order_modifiers_persistence.sql
psql "$DATABASE_URL" -f services/supabase/migrations/196_fn_ingest_loyverse_receipt.sql
```
Accept: zero errors; `v_dish_assembly_components` still compiles; existing seed (mig 124) untouched.

**Level 2 — Edge Function (M2):**
```bash
supabase functions deploy loyverse-sync
curl -X POST "$EDGE/loyverse-sync?action=pull_modifiers" -H "Authorization: Bearer $TOKEN"
```
Accept: 200 with `{ lists, options, warnings }`; rows in `pos_loyverse_modifier_lists` and `pos_loyverse_modifier_options`.

**Level 3 — admin UI (M2):**
Open `/menu/modifiers` locally → expect pulled lists section + bindings table + `Pull now` button. Add a binding → row appears in `nomenclature_modifier_options` with non-null slot, modifier_id, qty.

**Level 4 — ingest RPC (M4):**
```sql
SELECT fn_ingest_loyverse_receipt('{
  "receipt_number": "TEST-001",
  "total_money": 320,
  "line_items": [{
    "item_id": "<loyverse_item_id of SALE-CUSTOM-BOWL>",
    "quantity": 1,
    "price": 270,
    "line_modifiers": [
      {"modifier_option_id": "<chicken>", "name": "Chicken", "total_price": 50},
      {"modifier_option_id": "<spinach>", "name": "Spinach", "total_price": 0}
    ]
  }]
}'::jsonb);
```
Accept: 1 order, 1 order_item, 2 order_item_modifiers with non-null slot+modifier_id. Second call with same `receipt_number` → same UUID, no duplicates.

**Level 5 — end-to-end smoke (requires L2 staging + T5):**
CEO creates lego dish → push to Loyverse → creates Loyverse modifier_lists in Dashboard → assigns to item → pull in admin → map options → ring up test receipt → webhook fires (when T5 ready) → `SELECT slot, modifier_name FROM order_item_modifiers WHERE order_id=...` returns structured composition.

## 9. Migration Path Phase 1 → Phase 2 (SSoT flip)

Reference, not built here:

1. Add `push_modifier_list` action to `loyverse-sync`.
2. Make `/menu/modifiers` edit `name` + `price_delta` (read-only today).
3. One-shot script: for each `nomenclature_modifier_options` row, push to Loyverse, capture new `loyverse_modifier_id`. Verify diff = 0 after a pull.
4. CEO stops editing modifier_lists in Loyverse Dashboard (policy; Loyverse has no per-feature RBAC).
5. Pull becomes optional sanity-check.

Roughly 1–2 plans in a Phase 2 sprint.

## 10. Deliverable File List

```
services/supabase/migrations/192_lego_slot_vocab_swap.sql              [new]
services/supabase/migrations/193_modifier_options_lego_extension.sql   [new]
services/supabase/migrations/194_pos_loyverse_modifier_mirror.sql      [new]
services/supabase/migrations/195_order_modifiers_persistence.sql       [new]
services/supabase/migrations/196_fn_ingest_loyverse_receipt.sql        [new]
services/supabase/functions/loyverse-sync/index.ts                     [extend — add pull_modifiers]
apps/admin-panel/src/pages/menu/ModifiersPage.tsx                      [new]
apps/admin-panel/src/hooks/useModifierBindings.ts                      [new]
apps/admin-panel/src/hooks/useLoyverseModifierPull.ts                  [new]
apps/admin-panel/src/App.tsx                                           [extend — route]
apps/admin-panel/src/layouts/AppShell.tsx                              [extend — sidebar]
apps/admin-panel/src/components/menu/drawer/sections/<owner-tab>.tsx   [extend — exact file resolved at implementation; adds summary line + link]
docs/operations/loyverse-dashboard-conventions.md                      [new]
docs/superpowers/specs/2026-05-17-menu-card-full-design.md             [edit §4.6 slot vocab, §4.5 modifier columns]
```

5 migrations + 1 Edge Function extension + 4 frontend files + 1 frontend wire-up edit + 1 sidebar edit + 1 drawer extension + 1 new doc + 1 doc edit. Realistic in 2–3 PRs.

**Proposed PR split:**
- **PR A** (foundation): migrations 192–194 + `loyverse-sync` `pull_modifiers` action + `/menu/modifiers` page (M1 + M2).
- **PR B** (persistence): migrations 195–196 + RPC tests + DishDrawer summary line (M4).
- **PR C** (docs only): `loyverse-dashboard-conventions.md` + menu-card spec edits. Optional bundle into PR A.

## 11. Critical Files Reference

Existing files relied on, not modified beyond what's listed:

- [183_modifier_options_and_allergens.sql](../../../services/supabase/migrations/183_modifier_options_and_allergens.sql) — base `nomenclature_modifier_options` schema
- [179_dish_card_table.sql](../../../services/supabase/migrations/179_dish_card_table.sql) — `dish_card` (no changes)
- [145_bom_composition_slots.sql](../../../services/supabase/migrations/145_bom_composition_slots.sql) — original slot CHECK constraint (target of mig 192)
- [184_v_dish_assembly_components.sql](../../../services/supabase/migrations/184_v_dish_assembly_components.sql) — view that joins BOM with slot ordering
- [022_orders_pipeline.sql](../../../services/supabase/migrations/022_orders_pipeline.sql) — existing `orders` + `order_items`
- [loyverse-sync/index.ts](../../../services/supabase/functions/loyverse-sync/index.ts) — Edge Function gaining the `pull_modifiers` action
- [2026-05-17-menu-card-full-design.md](2026-05-17-menu-card-full-design.md) — sibling spec; §4.5 + §4.6 edited as part of M1.1
