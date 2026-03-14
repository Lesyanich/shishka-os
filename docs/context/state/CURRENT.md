# Current Deployment State

**Last updated:** 2026-03-14
**Active phase:** Phase 17 — Syrve Integration Foundation (in progress)
**Previous phase:** Phase 16 — MRP → PO Integration (complete)
**Error monitoring:** Sentry (`@sentry/react`) — ErrorBoundary + browserTracing + replay. Source maps: `hidden`.
**Auth:** Supabase Auth (email/password). `persistSession: true`. ProtectedRoute + AuthProvider.
**Branch:** `feature/phase-6-mapping-engine`

## Phase 11-16 Roadmap: Procurement & Receiving

| Phase | Name | Priority | Status |
|-------|------|----------|--------|
| 11 | Procurement Foundation (DB Schema) | P0 | **DONE** (060-063) |
| 12 | Procurement RPCs | P0 | **DONE** (064-065) |
| 13 | Receiving Station (Frontend — Cook/Admin UX) | P1 | **DONE** |
| 14 | Purchase Order Management (Frontend — Admin/Owner) | P2 | **DONE** |
| 15 | Financial Reconciliation (Frontend — Owner) | P2 | **DONE** |
| 16 | MRP → PO Integration | P3 | **DONE** |

→ Architecture: `02_Obsidian_Vault/Procurement & Receiving Architecture.md`
→ Module context: `docs/context/modules/procurement.md`

## Phase 17-20 Roadmap: Syrve Integration

| Phase | Name | Priority | Status |
|-------|------|----------|--------|
| 17 | Syrve Foundation — Nomenclature Mapping | P0 | **IN PROGRESS** |
| 18 | Purchase Push — Закупки → Syrve | P1 | planned |
| 19 | Sales Pull — Продажи из Syrve | P1 | planned |
| 20 | Waste Push + Analytics Comparison | P2 | planned |

→ Integration plan: `.claude/plans/declarative-napping-chipmunk.md`
→ Architecture: Fire-and-Forget Outbox Pattern (syrve_sync_queue), UoM conversion (syrve_uom_map), Tax mapping (syrve_tax_category_id)

## Recent Fix: Receipt Job Resilience (2026-03-14)

**Problem:** Realtime subscription for receipt_jobs was unreliable on Google Drive.
Google Drive file sync causes constant Vite HMR reloads, which remount FinanceManager
and destroy in-flight async state (pendingJobId, stagingData).

**Solution — 3-layer resilience in FinanceManager.tsx:**
1. **Module-level resolver** (`resolveJobToSessionStorage`) — async DB work outside React
   lifecycle. Survives HMR unmount/remount. Writes result to sessionStorage.
2. **sessionStorage persistence** — `pendingJobId`, `imageUrls`, `stagingData` all
   persist via sessionStorage. useState initializers read from sessionStorage on mount.
3. **Custom event bridge** (`receipt-job-resolved`) — module-level resolver dispatches
   event → React useEffect listener picks up result from sessionStorage.
4. **Fallback poll** every 10s (was 90s single-shot).

## Tables (Supabase public schema)

| Table | PK | Status | Notes |
|---|---|---|---|
| `nomenclature` | `id` UUID | LIVE | Unified SSoT (Products + Sync). Migration 005. brand_id + syrve_id DROPPED (059). +syrve_uuid, +syrve_tax_category_id (066). |
| `bom_structures` | `id` UUID | LIVE | Dynamic/Proportional BOM ratios. Migration 007 & 012. |
| `equipment` | `id` UUID | LIVE | 76 units. Refactored to UUID. |
| ~~`recipes_flow`~~ | -- | DROPPED | Dropped in migration 056 (Phase 9). |
| ~~`daily_plan`~~ | -- | DROPPED | Dropped in migration 056 (Phase 9). |
| `production_tasks` | `id` UUID | LIVE | KDS tasks. +target_nomenclature_id, target_quantity (048). |
| `production_task_outputs` | `id` UUID | LIVE | Multi-output tracker. Migration 048. |
| `fin_categories` | `code` INT | LIVE | 18 standardized financial codes |
| `fin_sub_categories` | `sub_code` INT | LIVE | 36 sub-categories |
| `capex_assets` | `id` UUID | LIVE | Linked to equipment via UUID FK |
| `capex_transactions` | `id` UUID | LIVE | Purchase and repair transactions |
| `expense_ledger` | `id` UUID | LIVE | Financial SSoT. Hub for receipt spokes. +created_by (055). +po_id (063). |
| `suppliers` | `id` UUID | LIVE | With category_code defaults. Auto-create on receipt. |
| `purchase_logs` | `id` UUID | LIVE | Food item purchases (spoke 1). +sku_id (057). +po_line_id, receiving_line_id (063). |
| `opex_items` | `id` UUID | LIVE | Operating expense items (spoke 3) |
| `receipt_jobs` | `id` UUID | LIVE | Async AI receipt parsing queue. |
| `orders` | `id` UUID | LIVE | Order pipeline with Kanban. |
| `order_items` | `id` UUID | LIVE | Order line items. +parent_item_id, modifier_type (051). |
| `production_plans` | `id` UUID | LIVE | MRP scenario planning. |
| `plan_targets` | `id` UUID | LIVE | MRP plan target items. |
| **`sku`** | `id` UUID | **LIVE** | **Phase 10: Physical product (brand+barcode+package). Many SKUs → one nomenclature. Migration 057.** |
| **`sku_balances`** | `sku_id` UUID | **LIVE** | **Phase 10: SKU-level inventory. Replaces inventory_balances. Migration 057.** |
| ~~`inventory_balances`~~ | -- | DROPPED | **Replaced by sku_balances + v_inventory_by_nomenclature (058).** |
| `waste_logs` | `id` UUID | LIVE | Waste tracking. Deducts from sku_balances (FIFO). |
| `locations` | `id` UUID | LIVE | Kitchen, Assembly, Storage. |
| `inventory_batches` | `id` UUID | LIVE | Batch tracking with internal barcodes (production). |
| `stock_transfers` | `id` UUID | LIVE | Batch movement log. |
| `supplier_catalog` | `id` UUID | LIVE | Unified supplier product catalog. +sku_id (057). UoM conversion stays here. |
| ~~`supplier_item_mapping`~~ | VIEW | DROPPED | Dropped in 056. |
| ~~`supplier_products`~~ | VIEW | DROPPED | Dropped in 056. |
| `product_categories` | `id` UUID | LIVE | Self-referencing 3-level product hierarchy. |
| `brands` | `id` UUID | LIVE | Normalized brand directory. |
| `tags` | `id` UUID | LIVE | Cross-cutting attributes. |
| `nomenclature_tags` | `(nom_id, tag_id)` | LIVE | Junction: nomenclature ↔ tags. |
| **`purchase_orders`** | `id` UUID | **LIVE** | **Phase 11: PO lifecycle (draft→reconciled). Auto PO-XXXX. Migration 061.** |
| **`po_lines`** | `id` UUID | **LIVE** | **Phase 11: PO line items. qty_ordered, unit_price_expected. Migration 061.** |
| **`receiving_records`** | `id` UUID | **LIVE** | **Phase 11: Physical receiving header. Links to PO or receipt. Migration 062.** |
| **`receiving_lines`** | `id` UUID | **LIVE** | **Phase 11: Receiving line items. qty_expected/received/rejected. Immutable. Migration 062.** |
| **`syrve_config`** | `key` TEXT | **LIVE** | **Phase 17: Key/value store for Syrve API credentials. Migration 066.** |
| **`syrve_sync_queue`** | `id` UUID | **LIVE** | **Phase 17: Fire-and-Forget Outbox. Async sync decoupled from approve. Migration 066.** |
| **`syrve_sync_log`** | `id` UUID | **LIVE** | **Phase 17: Audit trail for all sync operations. Migration 066.** |
| **`syrve_uom_map`** | `id` UUID | **LIVE** | **Phase 17: UoM conversion (box→liters). Migration 066.** |
| **`syrve_sales`** | `id` UUID | **LIVE** | **Phase 17: Pulled sales data from Syrve POS. Migration 066.** |

## Views

| View | Status | Notes |
|---|---|---|
| `v_inventory_by_nomenclature` | LIVE | Aggregation of sku_balances by nomenclature_id. Drop-in replacement for inventory_balances. Phase 10 (057). |

## Key RPCs & Functions

| Function | Type | Status |
|---|---|---|
| `fn_start_production_task(UUID)` | RPC | LIVE — reads target_nomenclature_id directly (056) |
| `fn_generate_barcode()` | UTIL | LIVE |
| `fn_generate_sku_code()` | UTIL | LIVE — Phase 10: generates SKU-0001 format codes (057) |
| `fn_sku_set_code()` | TRIGGER | LIVE — auto-assigns sku_code on INSERT (057) |
| `fn_create_batches_from_task(UUID, JSONB)` | RPC | LIVE — reads target_nomenclature_id (056) |
| `fn_open_batch(UUID)` | RPC | LIVE |
| `fn_transfer_batch(TEXT, TEXT)` | RPC | LIVE |
| `fn_predictive_procurement(UUID)` | RPC | LIVE — v3: reads v_inventory_by_nomenclature (058) |
| `fn_process_new_order(UUID)` | RPC | LIVE — BOM explosion for orders |
| `fn_run_mrp(UUID)` | RPC | LIVE — v2: reads v_inventory_by_nomenclature for RAW (058) |
| `fn_approve_plan(UUID)` | RPC | LIVE — creates production_tasks from plan |
| `fn_approve_receipt(JSONB)` | RPC | LIVE (v11) — SKU-aware + receiving_records audit trail (065) |
| `fn_update_cost_on_purchase()` | TRIGGER | LIVE — v3: WAC from v_inventory_by_nomenclature (058) |
| `fn_is_authenticated()` | UTIL | LIVE — `auth.role() = 'authenticated'` (054) |
| `fn_current_user_id()` | UTIL | LIVE — `auth.uid()` (054) |
| `fn_set_created_by()` | TRIGGER | LIVE — auto-fills expense_ledger.created_by (055) |
| `fn_cleanup_stale_receipt_jobs()` | RPC | LIVE — zombie job cleanup |
| `fn_generate_po_number()` | UTIL | LIVE — Phase 11: generates PO-0001 format codes (061) |
| `fn_po_set_number()` | TRIGGER | LIVE — auto-assigns po_number on INSERT (061) |
| `fn_create_purchase_order(JSONB)` | RPC | LIVE — Phase 12: creates PO + lines, auto-prices from catalog (064) |
| `fn_receive_goods(JSONB)` | RPC | LIVE — Phase 12: physical receiving, no inventory update (064) |
| `fn_approve_po(JSONB)` | RPC | LIVE — Phase 12: reconciliation → expense_ledger + purchase_logs + sku_balances (064) |
| `fn_pending_deliveries()` | RPC | LIVE — Phase 12: pending POs for /receive, no prices (064) |
| `fn_get_syrve_config()` | RPC | LIVE — Phase 17: returns syrve_config as JSONB (066) |
| `fn_upsert_syrve_config(TEXT, TEXT)` | RPC | LIVE — Phase 17: set config key/value (066) |
| `fn_save_syrve_mapping(UUID, UUID, UUID)` | RPC | LIVE — Phase 17: save nomenclature→syrve_uuid mapping (066) |

## 3-Tier Product Architecture (Phase 10)

```
nomenclature (abstract ingredient: "Olive Oil", base_unit: L)
  └── sku (physical product: "Monini Extra Virgin 1L", SKU-0001, barcode: 800551...)
        └── supplier_catalog (supplier offer: "Makro, 500 THB/case", conversion_factor: 12)
```

- **nomenclature** = BOM, recipes, WAC costing. No brand (brand_id dropped 059).
- **sku** = brand, barcode, package info. Auto-generated SKU-code (SKU-XXXX).
- **supplier_catalog** = price, UoM conversion (per supplier), match_count.
- **Inventory**: sku_balances (SKU-level) + v_inventory_by_nomenclature (aggregated view).
- **Analytics**: `purchase_logs JOIN sku JOIN brands` for brand-level spend analysis.

## Auth & Security (Phase 8)

- **Auth provider:** Supabase Auth (email/password)
- **Frontend:** AuthProvider → ProtectedRoute → AppShell (layout route with Outlet)
- **Login:** `/login` → LoginPage.tsx
- **RLS:** ALL tables use `auth_full_access` policy via `fn_is_authenticated()` (including sku, sku_balances)
- **SECURITY DEFINER** RPCs bypass RLS by design
- **created_by:** Auto-filled via `trg_set_created_by` trigger on expense_ledger

## Routing (Frontend)

| Route | Component | Status |
|---|---|---|
| `/login` | LoginPage.tsx | LIVE — public |
| `/` | ControlCenter.tsx | LIVE — protected |
| `/bom` | BOMHub.tsx | LIVE — protected |
| `/kds` | KDSBoard.tsx | LIVE — protected |
| `/cook` | CookStation.tsx | LIVE — protected |
| `/waste` | WasteTracker.tsx | LIVE — protected |
| `/logistics` | LogisticsScanner.tsx | LIVE — protected |
| `/procurement` | Procurement.tsx | LIVE — protected |
| `/sku` | SkuManagerPage.tsx | LIVE — protected (Phase 10.2) |
| `/orders` | OrderManager.tsx | LIVE — protected |
| `/planner` | MasterPlanner.tsx | LIVE — protected |
| `/receive` | ReceivingStation.tsx | LIVE — protected (Phase 13) |
| `/finance` | FinanceManager.tsx | LIVE — protected |
| `/settings` | Settings.tsx | LIVE — protected (Phase 17) |

## Migrations Applied

66 migrations total (001–066). Latest:
- 049: Supplier catalog SSoT merge. fn_approve_receipt v9.
- 050: WAC costing — Weighted Average Cost trigger.
- 051: Order modifiers — parent_item_id + modifier_type.
- 052: Accountability cleanup — created_by + deprecated ghost tables.
- 053: Security prep — auth helper functions.
- 054: Auth RLS — all 30 tables auth_full_access.
- 055: created_by tracking trigger.
- 056: Ghost RPC rewrite + DROP recipes_flow, daily_plan, deprecated views.
- 057: SKU Layer — sku table, sku_balances, v_inventory_by_nomenclature view, sku_id on supplier_catalog + purchase_logs, data migration from supplier_catalog.
- 058: SKU-aware RPCs — fn_approve_receipt v10 (SKU resolution), WAC/MRP/procurement → v_inventory_by_nomenclature, DROP inventory_balances.
- 059: Cleanup — DROP nomenclature.brand_id, nomenclature.syrve_id (deprecated/orphaned columns).
- 060: Procurement ENUMs — po_status, receiving_source, reject_reason.
- 061: Purchase Orders — purchase_orders + po_lines tables, auto PO-XXXX trigger, RLS, Realtime.
- 062: Receiving — receiving_records + receiving_lines tables, immutable audit trail, RLS.
- 063: Procurement Links — purchase_logs +po_line_id/receiving_line_id, expense_ledger +po_id.
- 064: Procurement RPCs — fn_create_purchase_order, fn_receive_goods, fn_approve_po, fn_pending_deliveries.
- 065: fn_approve_receipt v11 — + receiving_records/lines audit trail side effect.
- 066: Syrve Integration — syrve_config, syrve_sync_queue, syrve_sync_log, syrve_uom_map, syrve_sales tables. syrve_uuid/syrve_tax_category_id on nomenclature. syrve_uuid on suppliers. syrve_synced/syrve_doc_id on expense_ledger. 3 RPCs.

→ Full schema: `02_Obsidian_Vault/Database Schema.md`
