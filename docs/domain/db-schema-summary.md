# Database Schema Summary

> Lightweight reference. Full schema: `vault/Architecture/Database Schema.md`

## Core Tables

| Table | Purpose |
|-------|---------|
| `products` | All items (RAW, PF, MOD, SALE) with nutrition, cost, availability |
| `bom_lines` | Recipe ingredients (parent_id -> ingredient_id, quantity, yield_pct) |
| `supplier_catalog` | Supplier-product mapping with pricing (SSoT for procurement) |
| `sku_barcodes` | Barcode-to-product mapping |

## Finance Tables

| Table | Purpose |
|-------|---------|
| `financial_transactions` | Ledger entries (amount, category, supplier, date) |
| `receipt_jobs` | Receipt processing queue (status, photos, parsed data) |
| `inbox` | Receipt inbox (pending -> processing -> done) |

## Operations Tables

| Table | Purpose |
|-------|---------|
| `production_orders` | Kitchen production batches |
| `recipe_flow_steps` | Step-by-step production instructions with equipment |
| `equipment` | Kitchen equipment registry |
| `inventory_levels` | Current stock by product |
| `waste_log` | Waste tracking entries |

## Mission Control Tables

| Table | Purpose |
|-------|---------|
| `business_tasks` | Cross-domain backlog items (kanban: inbox→backlog→in_progress→done) |
| `business_initiatives` | Cross-domain projects grouping related tasks |

## Infrastructure

- **Database:** Supabase PostgreSQL 17.6 (ap-south-1)
- **Migrations:** `services/supabase/migrations/` (092+ files)
- **RLS:** Enabled on all tables
- **Auth:** `app.tg_user_id` + `is_admin` via `set_request_context()`
