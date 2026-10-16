# Spec: Stock–Purchase–Sales Control Analytics v1

> MC Task: 0229c4b7-b4e9-4140-9938-ca4fdd131bf1 (`stock-control-analytics`)
> Initiative: 9f7858cc-112f-4eae-81db-bfacdbe3ef03 (`admin-analytics-hub`) — this spec narrows and sequences P1/P2/P3/P6 of `spec-admin-analytics-hub.md` for the first deliverable.
> Depends on: MC 00a81c22 (importer matcher hardening, mig 459 — merged; backfill items 6/7 human-gated) · consumes MC c605e2ca (connected-stock epic) — does **not** rebuild it.
> Author: Cowork session with CEO, 2026-10-16
> Status: CEO decisions taken 2026-10-16 (§10) — S1 unblocked; the red-threshold ships with the §6 default and is tuned after 4 weeks of counts

## 0. TL;DR

The CEO's first analytics need is **control**: did the ingredients we bought turn into the dishes we sold, and where did the rest go? That is one number per item per period — **variance = expected closing stock − counted closing stock** — and everything else on the screens exists to explain it.

Prod audit (2026-10-16) shows the sales side is clean, the purchase side is itemised but mostly lands on throw-away `RAW-AUTO-*` stubs that reach no BOM, the stock ledger only knows sales deductions, counts happened once (baseline, 2026-08-31) and waste logging is unused. **A stock dashboard built on today's data would be distrusted on day one.** So v1 is:

1. **Phase 0 — close the data loop** (mostly process + the already-merged matcher fix): purchases on canonical items, a weekly count of the A-class items, waste logging, BOM coverage.
2. **A periodic (count-to-count) variance model** read straight from source documents — counts, purchase lines, sale deductions, waste — rather than from any of the three competing on-hand stores. No new write paths, no dependency on which on-hand store wins in the connected-stock epic.
3. **Three screens**, not six: Sales pulse · Purchases · Stock control. Weekly granularity. Owner-only. Read-only.

## 1. Ground truth — prod as of 2026-10-16

| Source | Rows | Window | Verdict |
|---|---|---|---|
| `orders` / `order_items` | 504 / 1 001 | 2026-05-18 → today | Clean. Loyverse two-way sync is the one reliable feed. Sept 2026: 177 receipts, THB 52 946. |
| `stock_movements` | 4 927 | 2026-05-18 → today | **Only** `loyverse_sale` (4 916) and `loyverse_refund` (11). No `purchase`, no `stocktake_adj`, no waste, no transfer. `location_id` is NULL on every row. |
| `purchase_logs` | 984 | 2026-03-31 → 2026-10-10 | All rows carry `nomenclature_id`; 972 link to `expense_ledger`; 0 link to `receiving_lines`. Covers ~90 % of ledger COGS by THB (Sept: 15 741 of 16 872). |
| …of which on `RAW-AUTO-*` stubs | 415 lines / 388 items / THB 67 714 (41 %) | since Aug: **80 % of THB** (129 lines, 122 stubs) | Zero of these items has any BOM consumption. Root cause fixed forward by mig 459 (deterministic matcher ladder, barcode persisted). Backfill of existing stub rows is item 6/7 of MC 00a81c22, human-gated. |
| `nomenclature` stubs | 521 `RAW-AUTO-*` (149 soft-deleted) | | |
| `unmatched_items` | 317 (8 resolved) | | The review queue exists; nobody works it. `v_catalog_match_queue` = 881. |
| `supplier_catalog` | 1 434 (553 → nomenclature, 488 with `conversion_factor`) | | Unit normalisation infrastructure exists for a third of the catalog. |
| `stocktake_sessions` / `stocktake_entries` | 4 / 122 (confirmed) | all 2026-08-31, `is_baseline=true` | Fridge (79 lines, var THB 10 641), Bar (31), Freezer (7), Chocolate (5). Baselines write no `stocktake_adj`. |
| `sku_balances` | 335 (119 non-zero) | `last_counted_at` = 2026-08-31 only | Global snapshot, never updated by sales. |
| `inventory_batches` | live | | Station-aware physical store (connected-stock W1 truth). Not fed by purchases. |
| `waste_logs` | **0** | | Table + enum (`expiration`, `spillage_damage`, `quality_reject`, `rd_testing`) + admin `WasteTracker.tsx` exist. Unused. |
| `nomenclature.count_class` | all NULL (mig 350) | | ABC classification never populated. |
| Sales → BOM deduction depth | RAW 96 items + PF 41 items (since Sept) | | Deductions stop at the PF tier for PFs; RAW inside a PF is **not** deducted by a sale. |
| Sold dishes without any deduction | 20 of 90 dishes sold since Sept | | BOM coverage gap (`v_dangling_bom` = 10). |

Three on-hand representations coexist (`sku_balances` global · `inventory_batches` per location · `stock_movements` sales deltas) — documented in `spec-connected-stock-model.md` §1.1. This spec does not pick a winner.

## 2. Design principle

**The control triangle.** Bought (THB, base units) → On hand (counted) → Sold (receipts × BOM). The business question is the gap between the three sides:

```
expected_closing = opening_count + purchases − theoretical_usage − waste
variance         = expected_closing − closing_count            (qty, THB)
```

Decisions that follow from the audit:

- **Periodic, not perpetual, for v1.** Variance is computed between two *count days*, from source documents. A perpetual on-hand ledger (purchases posted into `stock_movements`/`inventory_batches`) is the connected-stock epic's job (M6–M8, "demote `sku_balances`"); analytics must not depend on its outcome.
- **Weekly grain everywhere.** ~40 receipts/week in Sept. Daily item-level charts are noise; monthly is too slow to react. ISO weeks, Asia/Bangkok.
- **Item scope = A-class.** Variance only for items that are counted weekly (§3.3). Everything else shows purchases vs theoretical usage without a count (labelled "uncounted").
- **Global per item in v1, not per station.** `stock_movements.location_id` is NULL on sale deductions, so a station-level variance is not computable. Counts are summed across locations on the count day. Per-station variance is a fast-follow once sale deductions carry a location.
- **Coverage is a metric, not a caveat.** Every screen shows how much of the money it can see (purchase lines on canonical items, sold units with a BOM, A-items counted this week). The dashboard tells the owner when it is lying.
- **Hub constraints inherited** (spec-admin-analytics-hub §1): existing stack only, plain `security_invoker` views, no new tables, no external BI, dark brand theme, reuse Finance primitives, owner-only, read-only, no Loyverse history backfill.

## 3. Phase 0 — close the data loop (prerequisite, mostly process)

| # | What | Owner | Mechanism | Done when |
|---|---|---|---|---|
| 0.1 | Purchase lines land on canonical items | CEO / finance agent | Mig 459 already stops new stubs when the ladder resolves. Work the `unmatched_items` queue weekly (admin). Backfill = re-point **all 415** existing stub rows to canonical items (CEO 2026-10-16: full history, so item-level spend is comparable month to month) and normalise the 20 bad-unit rows against receipt images — MC 00a81c22 items 6/7. Order of work: rows since 2026-08-01 first (the variance window), then older. | `v_analytics_purchase_coverage_weekly.canonical_pct ≥ 90 %` for 2 consecutive weeks |
| 0.2 | Count day cadence | **Nene responsible; anyone may count** (CEO 2026-10-16) | One day a week — Monday before opening unless Nene picks another fixed day — **all stations** in `stocktake_sessions` (`fn_open_stocktake_session` per station, `scope='food'`, `is_baseline=false`), A-class list only (§3.3). Existing admin stocktake UI and Telegram bot path. `counted_by` records who counted; responsibility for completeness is Nene's. | ≥ 2 consecutive count days with ≥ 90 % of A-items counted |
| 0.3 | ABC classification | Code (view) + CEO sign-off | `v_analytics_abc_items`: rolling 8-week purchase THB per canonical item, cumulative 80/15/5 → A/B/C. Persist into `nomenclature.count_class` via a migration-time `UPDATE` (column exists, mig 350) so the stocktake UI can filter on it. Re-run monthly. | `count_class` populated for every canonical RAW/PF with purchases |
| 0.4 | Waste logging | Chef | Use `WasteTracker.tsx` (admin) — or the bot if the chef prefers — for every bin event. Three reasons are enough; `financial_liability` stays. | ≥ 1 waste entry per operating day over 2 weeks (or an explicit "zero waste" is not credible) |
| 0.5 | BOM coverage | Chef agent | Every active SALE dish deducts stock. Fix the 20 sold-without-deduction dishes and the 10 `v_dangling_bom` rows. | `v_analytics_bom_coverage_weekly.deducted_units_pct ≥ 95 %` |
| 0.6 | PF explosion for RAW variance | Code (view) | Because sale deductions stop at PF, RAW usage inside PFs is derived by exploding PF deductions through `bom_structures` (recursive, depth ≤ 3; the Lego pyramid guarantees acyclic). `yield_loss_pct` applied. | Unit test: a known manakish sale explodes to the expected flour/za'atar grams |

Nothing in Phase 0 adds a table or a write path. 0.1 is the only part with a known cost beyond discipline (the backfill), and it is already owned by MC 00a81c22.

## 4. Data layer — `v_analytics_*` views (one migration)

All plain views, `security_invoker`, Asia/Bangkok bucketing, refund-aware (exclude `receipt_type='REFUND'` and their offsets). Canonical item = `nomenclature.product_code NOT LIKE 'RAW-AUTO-%' AND NOT is_deleted`. `week` = `date_trunc('week', ts AT TIME ZONE 'Asia/Bangkok')::date`.

| View | Grain | Definition | Sources |
|---|---|---|---|
| `v_analytics_sales_daily` | day | receipts, gross/net revenue, discounts, refunds, tips, avg check, payment split, dine-in vs takeaway | `orders` (as hub spec) |
| `v_analytics_item_sales_daily` | day × dish | units, revenue, category | `order_items` × `orders` × `nomenclature` × `product_categories` |
| `v_analytics_hourly_heat` | dow × hour | receipts, revenue | `orders.loyverse_created_at` |
| `v_analytics_abc_items` | item | rolling 8-week purchase THB, cumulative share, class A/B/C, is_canonical | `purchase_logs` × `nomenclature` |
| `v_analytics_purchases_weekly` | week × item × supplier | lines, qty_base (`quantity × COALESCE(supplier_catalog.conversion_factor,1)`), THB, last unit price, is_canonical | `purchase_logs` × `supplier_catalog` × `suppliers` |
| `v_analytics_purchase_coverage_weekly` | week | THB total, THB on canonical items, canonical_pct, stub_lines, unmatched_open | `purchase_logs`, `unmatched_items` |
| `v_analytics_price_watch` | item | last price, 8-week median, Δ %, supplier, last invoice date; flag when Δ > +10 % | `purchase_logs` (reuse `v_price_comparison` for catalog-level cross-supplier compare) |
| `v_analytics_usage_weekly` | week × RAW/PF item | theoretical usage qty (direct deductions + PF explosion per §3.6), THB at current WAC | `stock_movements` (`loyverse_sale`, `loyverse_refund`) × `bom_structures` |
| `v_analytics_bom_coverage_weekly` | week | units sold, units with a deduction, deducted_units_pct, list of offending dishes | `order_items` ⟕ `stock_movements` |
| `v_analytics_count_days` | count_day × item | counted qty summed over locations, locations_counted, is_complete (all stations that stock the item counted that day) | `stocktake_entries` (confirmed) × `stocktake_sessions` × `stations` |
| `v_analytics_stock_variance` | count interval × item | opening, purchases_qty, usage_qty, waste_qty, expected_closing, closing, variance_qty, variance_thb (× WAC), variance_pct_of_usage, days_in_interval, class | the four above + `waste_logs` |
| `v_analytics_food_cost_weekly` | week | revenue, theoretical COGS (`Σ units × v_dish_cost_split.food_cost`), purchases THB (canonical), inventory Δ THB when both ends of the week are count days else NULL, actual COGS = purchases − inventory Δ, fc_theoretical_pct, fc_actual_pct, gap_thb | `v_analytics_sales_daily`, `v_dish_cost_split`, `v_analytics_purchases_weekly`, `v_analytics_count_days` |
| `v_analytics_inventory_value` | item × location | latest counted qty × WAC, days since count, class | `v_stock_latest_by_location` × `nomenclature` |
| `v_analytics_waste_weekly` | week × reason | qty, THB, liability split | `waste_logs` × `nomenclature` |

Reused as-is (no duplication): `v_station_replenishment` (reorder list), `v_stock_status` (expiring batches), `v_price_comparison` (cross-supplier), `v_dish_cost_split` (dish food cost).

Materialise only if measurably slow; not expected at this volume.

## 5. Screens — `/analytics`, 3 tabs

Shell as in hub spec §2 (new `NAV_SECTIONS` entry, `.shk-seg` tab switcher cloned from `FinanceLayout`, `minRole=owner`). Period selector: last 4 / 8 / 13 weeks; everything re-renders on it. Each tab opens with a one-line **coverage strip** (what share of the money this tab can see).

### Tab 1 — Sales pulse (buildable today)
| Widget | Content | Source |
|---|---|---|
| KPI strip | Revenue 7d / 28d, receipts, avg check, Δ vs previous period | `v_analytics_sales_daily` |
| Weekly revenue | Bars per ISO week, refunds overlaid, takeaway share as a thin line | `v_analytics_sales_daily` |
| Top-10 dishes | Units + revenue, category-coloured, period-scoped | `v_analytics_item_sales_daily` |
| Category mix | Revenue share per menu section | same × `product_categories` |
| Day × hour heatmap | Receipts (not revenue — more stable at this volume) | `v_analytics_hourly_heat` |

Deliberately **not** in v1: menu-engineering quadrants, ABC of dishes, modifier attach rates, shift cash reconciliation (hub P3/P4 — later).

### Tab 2 — Purchases (buildable today; honesty improves with Phase 0.1)
| Widget | Content | Source |
|---|---|---|
| Coverage strip | "This period: THB X purchased, Y % on canonical items, N lines awaiting match" with a link to the unmatched queue | `v_analytics_purchase_coverage_weekly` |
| Weekly spend | Stacked bars by purchase category (`expense_ledger.category_code` → fin categories), canonical vs stub hatched | `v_analytics_purchases_weekly` |
| **Purchases / revenue %** | Line per week — the crude actual food cost, available before any count exists; target band 28–35 % | `v_analytics_food_cost_weekly` |
| Supplier table | Supplier, THB, lines, share, last delivery, Δ vs previous period | `v_analytics_purchases_weekly` |
| Price watch | A-class items whose last unit price is > +10 % over the 8-week median, with supplier and date | `v_analytics_price_watch` |
| Top-20 items by spend | With class badge and "no BOM" badge for items that nothing consumes | `v_analytics_abc_items` |

### Tab 3 — Stock control (goes live after ≥ 2 count days)
| Widget | Content | Source |
|---|---|---|
| Coverage strip | "A-items counted this week: n/m · waste entries: k · BOM coverage: p %" | `v_analytics_count_days`, `v_analytics_waste_weekly`, `v_analytics_bom_coverage_weekly` |
| **Variance table** (the hero) | Per A-item for the latest count interval: opening · +purchases · −usage · −waste · =expected · counted · **variance qty / THB / % of usage**. Sorted by \|variance THB\| desc. Row colour by threshold (§6). Expand → the purchase lines, sale deductions and waste entries behind the numbers. | `v_analytics_stock_variance` |
| **Food cost: theoretical vs actual** | Two lines per week; shaded gap = unexplained THB. Actual only drawn for weeks bracketed by counts, otherwise dashed purchases-based line | `v_analytics_food_cost_weekly` |
| Inventory value | Tile: THB on hand at last count, by location (Fridge / Freezer / Bar / …), days since count | `v_analytics_inventory_value` |
| Waste | Bars by reason per week, THB; liability split | `v_analytics_waste_weekly` |
| Reorder / expiring | Compact reuse of existing views — no new logic | `v_station_replenishment`, `v_stock_status` |

### Design notes
- Charts: recharts 3.8, Finance primitives (`KpiCard`, `MonthlyChart`, `CategoryBreakdown`, `.shk-kpi/.shk-seg/.shk-panel`, `helpers.formatTHB`). Brand tokens from the shishka-health design system; no raw hex.
- Numbers never fake precision: when a metric's inputs are incomplete (no closing count, < 90 % canonical purchases) the widget greys out and says why instead of plotting a wrong line.
- Mobile: tables collapse to item cards; the variance table keeps three columns (item, variance THB, %).

## 6. Canonical metric formulas

- **Week** = ISO week, Asia/Bangkok. All views bucket on local date, never UTC.
- **Canonical item** = `product_code NOT LIKE 'RAW-AUTO-%' AND is_deleted = false`.
- **Purchases (qty)** = `Σ purchase_logs.quantity × COALESCE(supplier_catalog.conversion_factor, 1)` in `nomenclature.base_unit`. **Purchases (THB)** = `Σ total_price`.
- **Theoretical usage (RAW)** = Σ direct RAW deductions + Σ (PF deduction × BOM qty per unit × (1 + yield_loss_pct/100)) exploded recursively. **(PF)** = Σ PF deductions. Sign: `-qty_delta` for sales, `+qty_delta` for refunds.
- **Opening / closing** = `Σ counted_qty` over all locations on the count day; interval is `(previous count day, this count day]`.
- **Expected closing** = opening + purchases − usage − waste.
- **Variance** = expected − counted (positive = stock missing). THB at `nomenclature.cost_per_unit` (WAC at the time of the query — accepted v1 bias).
- **Variance % of usage** = variance_qty / NULLIF(usage_qty, 0).
- **Row colour (v1 default, CEO to tune after 4 weeks of counts).** Calibrated on prod 2026-10-16: the *largest* single item buys ~THB 160/week and the median A-item ~THB 40/week, so an absolute weekly THB bar would never fire; percent carries the signal, a small THB floor filters cheap-item noise:
  - ok: \|%\| < 10
  - watch: 10 ≤ \|%\| < 20
  - red: \|%\| ≥ 20 **and** \|THB\| ≥ 50 per week — or cumulative \|THB\| ≥ 300 over the last 4 count intervals regardless of %
  - Thresholds are constants in one helper (`analyticsThresholds.ts`), never scattered.
- **Food cost % (theoretical)** = `Σ(units × v_dish_cost_split.food_cost) / revenue`.
- **Food cost % (actual)** = `(purchases_thb − inventory_delta_thb) / revenue`; when no bracketing counts: `purchases_thb / revenue` and labelled "purchases-based".
- **Gap** = actual − theoretical (THB and pp). This is the single number the owner watches.
- **ABC** = cumulative share of rolling 8-week purchase THB: A ≤ 80 %, B ≤ 95 %, C rest.
- **Coverage**: canonical_pct = THB on canonical / THB total; deducted_units_pct = sold units with ≥ 1 `stock_movements` row / sold units; count completeness = A-items with a complete count this week / A-items.

## 7. Epic phases

| # | Task | Phase | Size | Gate / notes |
|---|---|---|---|---|
| S0.1 | Stub backfill + unmatched queue | finance / CEO | — | MC **00a81c22** items 6/7 (existing task). |
| S0.2 | Weekly A-class count SOP + first two count days | Nene | — | MC **1cd6366c** (ops, human). |
| S0.4 | Waste logging SOP | Nene / kitchen | — | MC **a596ecca** (kitchen, human). |
| S0.5 | BOM coverage: 20 sold dishes without deduction + 10 dangling rows | chef agent | — | MC **74d16673** (kitchen, agent). |
| S1 | Views migration `v_analytics_*` (§4) + `count_class` population (§3.3) + explosion unit test (§3.6); ≥ 2 metrics cross-checked vs manual SQL | code | M | Blocks all tabs. **MC 1be5f592** (hub P1, re-scoped — CEO 2026-10-16: keep the id, do not run both). |
| S2 | `/analytics` shell + **Sales pulse** tab | code | M | First visible value. **MC fd0a3475** (hub P2, re-scoped; heatmap moved here from P3). |
| S3 | **Purchases** tab | code | M | **MC 399488b2** (new). Ships with the coverage strip even if S0.1 is incomplete — the strip *is* the pressure to finish S0.1. |
| S4 | **Stock control** tab | code | M | **MC d8c02f8c** (hub P6, re-scoped to the periodic model, unblocked from the connected-stock epic). Requires ≥ 2 complete count days on prod; until then renders coverage strip + waste + inventory value only. |
| S5 | Tuning: thresholds, per-station variance once sale deductions carry `location_id`, supplier price snapshots instead of current WAC | code | S | After 4 weeks of counts. Not yet an MC task. |

Order: S1 → S2 → S3 → S4; S0.x start now in parallel. Hub P3 (338c787e) parked in backlog behind S4. Acceptance for every UI phase per hub spec §5: full `npm run build` (tsc -b) passes; Vercel preview + "what/where to click" in the MC comment (RULE-HANDOFF-PACKET CEO delivery gate); ≥ 2 metrics cross-checked against manual SQL on prod.

Hub phases P4 (menu engineering), P5 (P&L-lite), P7 (labor & customers), P8 (alerts) stay parked and untouched by this spec.

## 8. Risks & known limitations

- **Stub re-pointing rewrites history.** When MC 00a81c22 re-points `RAW-AUTO` rows, past weeks' purchase coverage and variance change retroactively. Acceptable — that is the point — but the first honest variance interval is the first one *after* the backfill plus a count day.
- **Unit errors dominate small variances.** 20 purchase rows already violate qty × price = total; a 100 g pack booked as 1 kg produces a 900 g "surplus". The import guard (mig 459 F) stops new ones; the variance table's expand row makes the bad line visible.
- **PF explosion is theoretical.** Real PF production is logged in `production_log` / `production_task_outputs`; v1 ignores it and assumes BOM-standard yields. Variance on RAW therefore includes production over/under-yield — which is itself what the chef needs to see. Separate "production variance" is a later refinement.
- **WAC bias** (hub §6): THB variance uses current cost, not purchase-time cost.
- **Partial counts.** An item counted at Fridge but not at Bar on the same day is `is_complete=false` and excluded from the variance table (shown in the coverage strip instead), otherwise phantom shortages appear.
- **Small window / small volume**: ~40 receipts a week. Weekly grain, no YoY, medians not means.
- **RLS**: as hub §6 — owner gating is UI-level until the auth-hardening epic; views are `security_invoker`, no new exposure. `purchase_logs` and `expense_ledger` are already column-restricted (mig 336) — views must not re-expose price columns to non-owners.
- **`syrve_sales` is dead** — not a source.

## 9. Out of scope (explicitly)

Posting purchases into any on-hand store · reconciling `sku_balances` / `inventory_batches` / `stock_movements` (connected-stock epic) · alerts, Telegram digests, auto-tasks (hub P8) · per-station variance · menu engineering · P&L · labor · customer analytics · any Loyverse history backfill before 2026-05-18.

## 10. CEO decisions (Socratic gate, answered 2026-10-16)

| # | Question | Decision |
|---|---|---|
| 1 | Count day — who and when | **Nene is responsible for the weekly count; anyone on staff may do the counting.** Day: Monday before opening by default; Nene may fix another day, but it must be the same day every week. Weekly, all stations, A-class only (~30–40 items at today's spend). |
| 2 | Red threshold in the variance table | **Open — CEO wants to think.** v1 ships with the §6 default (red = \|%\| ≥ 20 and \|THB\| ≥ 50/week, or ≥ THB 300 cumulative over 4 intervals), kept in one constants file so it can be changed without a release of logic. Revisit after 4 weeks of real counts, with the actual distribution of variances in front of us. |
| 3 | Backfill scope for `RAW-AUTO` stub rows (MC 00a81c22 item 6) | **All 415 rows, full history** — the CEO wants item-level spend comparable month to month. Work order: since 2026-08-01 first (variance window), then March–July. Note: monthly *totals* in THB are unaffected by the backfill (they come from `expense_ledger` / `purchase_logs` sums); the backfill changes *which item* the money is attributed to and un-fragments duplicates (e.g. three lamb stubs, four chicken-breast stubs, three mozzarella stubs seen in the 8-week top-40). |
| 4 | Hub tasks P1 / P6 | **Re-scope, keep the ids** (CEO delegated: "whatever is better and leaner"). P1 1be5f592 = S1 of this spec; P6 d8c02f8c = S4. Their `spec_file` points here; the hub spec remains the umbrella. |

## 11. Acceptance for this spec deliverable

- Spec committed on a feature branch and linked from MC 0229c4b7 (`spec_file`); CEO decisions recorded in a task comment (done 2026-10-16).
- S1 migration may start (RULE-SOCRATIC-GATE satisfied); the threshold constant is not a blocker.
