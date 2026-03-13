# Current Deployment State

**Last updated:** 2026-03-13
**Active phase:** Phase 7.0 — FMCG + Restaurant Hybrid Categorization System
**Error monitoring:** Sentry (`@sentry/react`) — ErrorBoundary + browserTracing + replay. Source maps: `hidden`.
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
| `fin_sub_categories` | `sub_code` INT | LIVE | 36 sub-categories (11 food: 4101-4111) |
| `capex_assets` | `id` UUID | LIVE | Linked to equipment via UUID FK |
| `capex_transactions` | `id` UUID | LIVE | Purchase and repair transactions |
| `expense_ledger` | `id` UUID | LIVE | Financial SSoT. Hub for receipt spokes. delivery_fee (v7). |
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
| `supplier_products` | `id` UUID | LIVE | Verified product catalog (17 items). full_title, package_qty/unit, category_code FK, nomenclature_id FK, brand_id FK. |
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
| `fn_approve_receipt(JSONB)` | RPC | LIVE (v8) — Hub+Spoke atomic insert + UoM conversion + delivery_fee + auto-derive sub_category from product_categories |
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

47 migrations total (001–047). Latest:
- 042: `supplier_products` table — verified product catalog with 17 Makro items
- 043: Product Catalog Overhaul — fin_sub_categories 3→11 food, ALTER supplier_products (full_title, package_qty/unit, category_code FK, nomenclature_id FK), SEED nomenclature ~38 RAW-
- 044: Nomenclature dedup — safe FK-aware DELETEs (v2 fix), salt 3→3 (iodized/plain/curing per CEO), fix null base_units, standardize product_code naming to hyphens
- 045: FMCG+Restaurant categorization — product_categories (3L hierarchy, 75 nodes), brands (10), tags (~37), nomenclature_tags junction. tag_group ENUM.
- 046: Link nomenclature + supplier_products to categories & brands — ALTER ADD category_id/brand_id FKs, backfill all ~78 items
- 047: `fn_approve_receipt` v8 — auto-derive sub_category_code from product_categories.default_fin_sub_code

→ Full schema: `02_Obsidian_Vault/Database Schema.md`
