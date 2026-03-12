# Current Deployment State

**Last updated:** 2026-03-12
**Active phase:** Phase 6 — Perfect Inventory & Mapping Engine
**Branch:** `feature/phase-6-mapping-engine`

## Tables (Supabase public schema)

| Table | PK | Status | Notes |
|---|---|---|---|
| `nomenclature` | `id` UUID | LIVE | Unified SSoT (Products + Sync). Migration 005. |
| `bom_structures` | `id` UUID | LIVE | Dynamic/Proportional BOM ratios. Migration 007 & 012. |
| `equipment` | `id` UUID | LIVE | 76 units. Refactored to UUID. |
| `recipes_flow` | `id` UUID | LIVE | Transformed to UUID in Migration 006. |
| `daily_plan` | `id` UUID | LIVE | Transformed to UUID in Migration 006. |
| `production_tasks` | `id` UUID | LIVE | KDS tasks. Migration 010, 016. |
| `fin_categories` | `code` INT | LIVE | 18 standardized financial codes |
| `fin_sub_categories` | `sub_code` INT | LIVE | 28 sub-categories |
| `capex_assets` | `id` UUID | LIVE | Linked to equipment via UUID FK |
| `capex_transactions` | `id` UUID | LIVE | Purchase and repair transactions |
| `expense_ledger` | `id` UUID | LIVE | Financial SSoT. Hub for receipt spokes. |
| `suppliers` | `id` UUID | LIVE | With category_code defaults. Auto-create on receipt. |
| `purchase_logs` | `id` UUID | LIVE | Food item purchases (spoke 1) |
| `opex_items` | `id` UUID | LIVE | Operating expense items (spoke 3) |
| `receipt_jobs` | `id` UUID | LIVE | Async AI receipt parsing queue. Realtime-enabled. |
| `orders` | `id` UUID | LIVE | Order pipeline with Kanban. |
| `order_items` | `id` UUID | LIVE | Order line items. |
| `production_plans` | `id` UUID | LIVE | MRP scenario planning. |
| `plan_targets` | `id` UUID | LIVE | MRP plan target items. |
| `inventory_balances` | `nomenclature_id` UUID | LIVE | Stocktake balances. |
| `waste_logs` | `id` UUID | LIVE | Waste tracking. |
| `locations` | `id` UUID | LIVE | Kitchen, Assembly, Storage. |
| `inventory_batches` | `id` UUID | LIVE | Batch tracking with barcodes. |
| `stock_transfers` | `id` UUID | LIVE | Batch movement log. |
| `supplier_item_mapping` | `id` UUID | LIVE | Smart supplier→nomenclature mapping. |

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
| `fn_approve_receipt(JSONB)` | RPC | LIVE (v6) — Hub+Spoke atomic insert + UoM conversion |
| `fn_update_cost_on_purchase()` | TRIGGER | LIVE — auto-updates nomenclature.cost_per_unit |
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

40 migrations total (001–040). Latest:
- 038: `expense_ledger` reconciliation columns + `fn_approve_receipt` v5
- 039: `supplier_item_mapping` UoM conversion columns
- 040: `fn_approve_receipt` v6 — applies conversion_factor from supplier_item_mapping

→ Full schema: `02_Obsidian_Vault/Database Schema.md`
