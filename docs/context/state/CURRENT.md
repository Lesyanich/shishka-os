# Current Deployment State

**Last updated:** 2026-03-13
**Active phase:** Phase 7.1 — DB Architecture Audit (6 migrations: 048–053)
**Error monitoring:** Sentry (`@sentry/react`) — ErrorBoundary + browserTracing + replay. Source maps: `hidden`.
**Branch:** `feature/phase-6-mapping-engine`

## Tables (Supabase public schema)

| Table | PK | Status | Notes |
|---|---|---|---|
| `nomenclature` | `id` UUID | LIVE | Unified SSoT (Products + Sync). Migration 005. |
| `bom_structures` | `id` UUID | LIVE | Dynamic/Proportional BOM ratios. Migration 007 & 012. |
| `equipment` | `id` UUID | LIVE | 76 units. Refactored to UUID. |
| `recipes_flow` | `id` UUID | DEPRECATED | Used by RPCs (016, 018). Will drop after RPC rewrite. Migration 006, 052. |
| `daily_plan` | `id` UUID | DEPRECATED | Used by fn_predictive_procurement (017). Migration 006, 052. |
| `production_tasks` | `id` UUID | LIVE | KDS tasks. +target_nomenclature_id, target_quantity (048). Migration 010, 016, 048. |
| `production_task_outputs` | `id` UUID | LIVE | Multi-output tracker (primary + by-products). Migration 048. |
| `fin_categories` | `code` INT | LIVE | 18 standardized financial codes |
| `fin_sub_categories` | `sub_code` INT | LIVE | 36 sub-categories (11 food: 4101-4111) |
| `capex_assets` | `id` UUID | LIVE | Linked to equipment via UUID FK |
| `capex_transactions` | `id` UUID | LIVE | Purchase and repair transactions |
| `expense_ledger` | `id` UUID | LIVE | Financial SSoT. Hub for receipt spokes. delivery_fee (v7). +created_by (052). |
| `suppliers` | `id` UUID | LIVE | With category_code defaults. Auto-create on receipt. |
| `purchase_logs` | `id` UUID | LIVE | Food item purchases (spoke 1) |
| `opex_items` | `id` UUID | LIVE | Operating expense items (spoke 3) |
| `receipt_jobs` | `id` UUID | LIVE | Async AI receipt parsing queue. Realtime-enabled. |
| `orders` | `id` UUID | LIVE | Order pipeline with Kanban. |
| `order_items` | `id` UUID | LIVE | Order line items. +parent_item_id (self-ref FK), modifier_type (051). |
| `production_plans` | `id` UUID | LIVE | MRP scenario planning. |
| `plan_targets` | `id` UUID | LIVE | MRP plan target items. |
| `inventory_balances` | `nomenclature_id` UUID | LIVE | Stocktake balances. |
| `waste_logs` | `id` UUID | LIVE | Waste tracking. |
| `locations` | `id` UUID | LIVE | Kitchen, Assembly, Storage. |
| `inventory_batches` | `id` UUID | LIVE | Batch tracking with barcodes. |
| `stock_transfers` | `id` UUID | LIVE | Batch movement log. |
| `supplier_catalog` | `id` UUID | LIVE | Unified supplier product catalog (SSoT merge of SIM+SP). Migration 049. |
| `supplier_item_mapping` | VIEW | DEPRECATED | Backward-compat view over supplier_catalog. Migration 049. |
| `supplier_products` | VIEW | DEPRECATED | Backward-compat view over supplier_catalog. Migration 049. |
| `product_categories` | `id` UUID | LIVE | Self-referencing 3-level product hierarchy (3 L1 → 16 L2 → 56 L3). Migration 045. |
| `brands` | `id` UUID | LIVE | Normalized brand directory (10 brands). Migration 045. |
| `tags` | `id` UUID | LIVE | Cross-cutting attributes: dietary, allergen, functional, storage, quality, cuisine, technique (~37 tags). Migration 045. |
| `nomenclature_tags` | `(nom_id, tag_id)` | LIVE | Junction: nomenclature ↔ tags (many-to-many). Migration 045. |

## Key RPCs & Functions

| Function | Type | Status |
|---|---|---|
| `fn_start_kitchen_task(UUID)` | RPC | LIVE |
| `fn_start_production_task(UUID)` | RPC | LIVE — freezes BOM snapshot |
| `fn_generate_barcode()` | UTIL | LIVE |
| `fn_create_batches_from_task(UUID, JSONB)` | RPC | LIVE |
| `fn_open_batch(UUID)` | RPC | LIVE |
| `fn_transfer_batch(TEXT, TEXT)` | RPC | LIVE |
| `fn_predictive_procurement(UUID)` | RPC | LIVE — recursive BOM walk |
| `fn_process_new_order(UUID)` | RPC | LIVE — BOM explosion for orders |
| `fn_run_mrp(UUID)` | RPC | LIVE — 2-level BOM explosion + inventory deduction |
| `fn_approve_plan(UUID)` | RPC | LIVE — creates production_tasks from plan |
| `fn_approve_receipt(JSONB)` | RPC | LIVE (v9) — Hub+Spoke atomic insert + UoM from supplier_catalog (was SIM). v8 auto-derive preserved. |
| `fn_update_cost_on_purchase()` | TRIGGER | LIVE — WAC (Weighted Average Cost). Replaced Last-In pricing (050). |
| `fn_is_authenticated()` | UTIL | LIVE — Phase 8 prep: auth gating (currently returns true). 053. |
| `fn_current_user_id()` | UTIL | LIVE — Phase 8 prep: user UUID (currently returns NULL). 053. |
| `fn_cleanup_stale_receipt_jobs()` | RPC | LIVE — zombie job cleanup |

## Routing (Frontend)

| Route | Component | Status |
|---|---|---|
| `/` | ControlCenter.tsx | LIVE |
| `/bom` | BOMHub.tsx | LIVE |
| `/kds` | KDSBoard.tsx | LIVE |
| `/cook` | CookStation.tsx | LIVE |
| `/waste` | WasteTracker.tsx | LIVE |
| `/logistics` | LogisticsScanner.tsx | LIVE |
| `/procurement` | Procurement.tsx | LIVE |
| `/orders` | OrderManager.tsx | LIVE |
| `/planner` | MasterPlanner.tsx | LIVE |
| `/finance` | FinanceManager.tsx | LIVE |

## Migrations Applied

53 migrations total (001–053). Latest:
- 047: `fn_approve_receipt` v8 — auto-derive sub_category_code from product_categories.default_fin_sub_code
- 048: Production outputs — target_nomenclature_id + production_task_outputs (multi-output/by-products)
- 049: Supplier catalog SSoT — merged supplier_item_mapping + supplier_products → supplier_catalog + backward-compat views. fn_approve_receipt v9.
- 050: WAC costing — fn_update_cost_on_purchase() now uses Weighted Average Cost instead of Last-In pricing
- 051: Order modifiers — parent_item_id (self-ref FK) + modifier_type on order_items for toppings/modifiers
- 052: Accountability cleanup — expense_ledger.created_by + deprecated recipes_flow/daily_plan (NOT dropped)
- 053: Security prep — fn_is_authenticated() + fn_current_user_id() helpers for Phase 8 Auth. RLS migration plan documented.

→ Full schema: `02_Obsidian_Vault/Database Schema.md`
