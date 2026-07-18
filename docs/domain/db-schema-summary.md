# Database Schema Summary

> Lightweight reference. **Full, authoritative schema:** `vault/Database/Schema.md`
> (every table, FK, RPC, trigger deployed to prod).
>
> **Freshness:** refreshed 2026-07-18 against live DB (`qcqgtcsjoacuktcewpvo`, ap-south-1).
> Table names below are the LIVE names. Verify against `vault/Database/Schema.md` or
> `list_tables` before relying on them — the schema moves fast (385 migrations and counting).

## Core Tables

| Table | Purpose |
|-------|---------|
| `nomenclature` | All items (RAW, PF, MOD, SALE) with nutrition, cost, availability. Key: `product_code`. (was `products`) |
| `bom_structures` | Recipe ingredients (parent → ingredient, quantity, yield_pct). (was `bom_lines`) |
| `recipes_flow` | Step-by-step production instructions with equipment. (was `recipe_flow_steps`) |
| `product_categories` | Category axis incl. non-food codes (`NF`, `NF-PKG`, `NF-DSP`) used by packaging-as-BOM |
| `supplier_catalog` | Supplier-product mapping with pricing (SSoT for procurement) |
| `sku` / `sku_identifiers` / `sku_balances` | SKU layer: units, barcodes/identifiers (was `sku_barcodes`), on-hand balances |

## Finance Tables

| Table | Purpose |
|-------|---------|
| `expense_ledger` | Ledger entries (amount, category, supplier, date). (was the phantom `financial_transactions`) |
| `purchase_logs` / `purchase_orders` | Purchase history (drives WAC) and purchase orders |
| `receipt_jobs` | Receipt processing queue (status, photos, parsed data) |
| `receipt_inbox` | Receipt inbox (pending → processing → done). (was `inbox`) |
| `financial_obligations` | Creditor / obligations register |

## Operations / Stock Tables

| Table | Purpose |
|-------|---------|
| `production_orders` / `production_tasks` / `production_plans` / `production_targets` | Kitchen production batches, tasks, plans, targets |
| `equipment` (+ `equipment_slots` / `equipment_bookings` / `equipment_maintenance`) | Kitchen equipment registry and scheduling |
| `inventory_batches` / `stock_movements` | Current stock by batch + movement log. (replaced the old `inventory_levels`) |
| `stock_requests` / `stock_request_lines` / `stock_transfers` | Inter-station stock requests and transfers |
| `stocktake_sessions` / `stocktake_entries` | Physical count sessions |
| `waste_logs` / `waste_entries` | Waste tracking. (was `waste_log`) |

## Mission Control Tables

| Table | Purpose |
|-------|---------|
| `business_tasks` | Cross-domain backlog items (kanban: inbox→backlog→in_progress→done) |
| `business_initiatives` | Cross-domain projects grouping related tasks |
| `sprints` | Sprint planning |

## Knowledge / Intake

| Table | Purpose |
|-------|---------|
| `brain_inbox` | Raw field-note / idea intake (there is no `field_notes` table — that name never shipped) |

## Infrastructure

- **Database:** Supabase PostgreSQL 17.6 (ap-south-1)
- **Migrations:** `services/supabase/migrations/` (**385 files** as of 2026-07-18)
- **RLS:** enabled on all tables; owner-gating via `fn_is_owner()` (migs 172/313/336). See `docs/domain/rls-audit-2026-04-06.md` for the historical baseline (partially superseded).
- **Auth:** admin PIN = the Supabase Auth password; owner vs staff separation enforced by `fn_is_owner()` + RLS/trigger locks (migs 313/336/337). (The old `app.tg_user_id` + `set_request_context()` Telegram-era model is retired.)
