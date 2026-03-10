---
title: Database Schema
tags:
  - database
  - shishka-os
  - supabase
  - architecture
  - schema
date: 2026-03-10
status: active
aliases:
  - DB Schema
  - Supabase Schema
---

# Database Schema

> [!info] Single Source of Truth
> Supabase PostgreSQL 17.6 (`qcqgtcsjoacuktcewpvo`, ap-south-1). This note documents every table, FK, RPC, and trigger deployed to production.

## Entity Relationship Diagram

```mermaid
erDiagram
    nomenclature {
        UUID id PK
        TEXT product_code
        TEXT name
        TEXT type
        TEXT base_unit
        NUMERIC cost_per_unit
        NUMERIC price
        TEXT slug
        BOOLEAN is_available
        INTEGER calories
        NUMERIC protein
        NUMERIC carbs
        NUMERIC fat
    }

    bom_structures {
        UUID id PK
        UUID parent_id FK
        UUID ingredient_id FK
        NUMERIC quantity_per_unit
        NUMERIC yield_percent
        TEXT notes
    }

    equipment {
        UUID id PK
        TEXT name
        TEXT category
        TEXT status
        DATE last_service_date
        UUID syrve_uuid
    }

    production_tasks {
        UUID id PK
        UUID equipment_id FK
        UUID order_id FK
        TEXT status
        TEXT description
        TIMESTAMPTZ scheduled_start
        INTEGER duration_min
        NUMERIC theoretical_yield
        NUMERIC actual_weight
        JSONB theoretical_bom_snapshot
    }

    inventory_balances {
        UUID nomenclature_id PK
        NUMERIC quantity
        TIMESTAMPTZ last_counted_at
    }

    waste_logs {
        UUID id PK
        UUID nomenclature_id FK
        NUMERIC quantity
        waste_reason reason
        financial_liability liability
        TEXT comment
    }

    locations {
        UUID id PK
        TEXT name
        location_type type
    }

    inventory_batches {
        UUID id PK
        UUID nomenclature_id FK
        UUID location_id FK
        UUID production_task_id FK
        TEXT barcode
        NUMERIC weight
        batch_status status
        TIMESTAMPTZ expires_at
    }

    stock_transfers {
        UUID id PK
        UUID batch_id FK
        UUID from_location FK
        UUID to_location FK
        TEXT transferred_by
    }

    suppliers {
        UUID id PK
        TEXT name
        TEXT contact_info
        BOOLEAN is_deleted
    }

    purchase_logs {
        UUID id PK
        UUID nomenclature_id FK
        UUID supplier_id FK
        NUMERIC quantity
        NUMERIC price_per_unit
        NUMERIC total_price
        DATE invoice_date
    }

    fin_categories {
        INTEGER code PK
        TEXT name
    }

    fin_sub_categories {
        INTEGER sub_code PK
        INTEGER category_code FK
        TEXT name
    }

    orders {
        UUID id PK
        order_source source
        order_status status
        TEXT customer_name
        NUMERIC total_amount
    }

    order_items {
        UUID id PK
        UUID order_id FK
        UUID nomenclature_id FK
        INTEGER quantity
        NUMERIC price_at_purchase
    }

    production_plans {
        UUID id PK
        TEXT name
        DATE target_date
        plan_status status
        JSONB mrp_result
    }

    plan_targets {
        UUID id PK
        UUID plan_id FK
        UUID nomenclature_id FK
        INTEGER target_qty
    }

    expense_ledger {
        UUID id PK
        DATE transaction_date
        TEXT flow_type
        INTEGER category_code FK
        INTEGER sub_category_code FK
        UUID supplier_id FK
        TEXT details
        TEXT comments
        NUMERIC amount_original
        TEXT currency
        NUMERIC exchange_rate
        NUMERIC amount_thb "GENERATED"
        TEXT status
        BOOLEAN has_tax_invoice
    }

    nomenclature ||--o{ bom_structures : "parent_id"
    nomenclature ||--o{ bom_structures : "ingredient_id"
    nomenclature ||--o{ inventory_balances : "nomenclature_id"
    nomenclature ||--o{ waste_logs : "nomenclature_id"
    nomenclature ||--o{ inventory_batches : "nomenclature_id"
    nomenclature ||--o{ purchase_logs : "nomenclature_id"
    nomenclature ||--o{ order_items : "nomenclature_id"
    nomenclature ||--o{ plan_targets : "nomenclature_id"

    equipment ||--o{ production_tasks : "equipment_id"
    orders ||--o{ order_items : "order_id"
    orders ||--o{ production_tasks : "order_id"

    locations ||--o{ inventory_batches : "location_id"
    locations ||--o{ stock_transfers : "from/to"
    inventory_batches ||--o{ stock_transfers : "batch_id"
    production_tasks ||--o{ inventory_batches : "production_task_id"

    suppliers ||--o{ purchase_logs : "supplier_id"
    suppliers ||--o{ expense_ledger : "supplier_id"

    fin_categories ||--o{ fin_sub_categories : "category_code"
    fin_categories ||--o{ expense_ledger : "category_code"
    fin_sub_categories ||--o{ expense_ledger : "sub_category_code"

    production_plans ||--o{ plan_targets : "plan_id"
```

## Tables Index

| Table | PK | Key Columns | Foreign Keys | Migration |
|---|---|---|---|---|
| `nomenclature` | `id` UUID | product_code, name, type, base_unit, cost_per_unit, price, slug | -- | 005, 019, 020 |
| `bom_structures` | `id` UUID | parent_id, ingredient_id, quantity_per_unit | parent_id -> nomenclature, ingredient_id -> nomenclature | 007, 012 |
| `equipment` | `id` UUID | name, category, status, last_service_date | -- | pre-existing |
| `production_tasks` | `id` UUID | status, scheduled_start, equipment_id, order_id | equipment_id -> equipment, order_id -> orders | 016, 022 |
| `recipes_flow` | `id` UUID | -- | -- | pre-existing |
| `daily_plan` | `id` UUID | -- | -- | pre-existing |
| `fin_categories` | `code` INT | name | -- | 003 |
| `fin_sub_categories` | `sub_code` INT | category_code, name | category_code -> fin_categories | 003 |
| `capex_assets` | `id` UUID | equipment FK | equipment_id -> equipment | 003 |
| `capex_transactions` | `id` UUID | category_code, amount_thb | category_code -> fin_categories | 003 |
| `inventory_balances` | `nomenclature_id` UUID | quantity, last_counted_at | nomenclature_id -> nomenclature | 017 |
| `waste_logs` | `id` UUID | nomenclature_id, quantity, reason | nomenclature_id -> nomenclature | 017 |
| `locations` | `id` UUID | name (UNIQUE), type | -- | 018 |
| `inventory_batches` | `id` UUID | barcode (UNIQUE), status, expires_at | nomenclature_id -> nomenclature, location_id -> locations, production_task_id -> production_tasks | 018 |
| `stock_transfers` | `id` UUID | from_location, to_location | batch_id -> inventory_batches, from/to -> locations | 018 |
| `suppliers` | `id` UUID | name (UNIQUE), is_deleted | -- | 021, 025 |
| `purchase_logs` | `id` UUID | quantity, price_per_unit, invoice_date | nomenclature_id -> nomenclature, supplier_id -> suppliers | 021 |
| `orders` | `id` UUID | source, status, customer_name, total_amount | -- | 022 |
| `order_items` | `id` UUID | quantity, price_at_purchase | order_id -> orders (CASCADE), nomenclature_id -> nomenclature | 022 |
| `production_plans` | `id` UUID | name, target_date, status, mrp_result | -- | 023 |
| `plan_targets` | `id` UUID | target_qty, UNIQUE(plan_id,nomenclature_id) | plan_id -> production_plans (CASCADE), nomenclature_id -> nomenclature | 023 |
| `expense_ledger` | `id` UUID | details, comments, amount_original, currency, exchange_rate, amount_thb (GENERATED), has_tax_invoice | category_code -> fin_categories, sub_category_code -> fin_sub_categories, supplier_id -> suppliers | 024, 026 |

## Custom ENUM Types

| Enum | Values | Used In |
|---|---|---|
| `waste_reason` | expiration, spillage_damage, quality_reject, rd_testing | waste_logs.reason |
| `financial_liability` | cafe, employee, supplier | waste_logs.liability |
| `location_type` | kitchen, assembly, storage, delivery | locations.type |
| `batch_status` | sealed, opened, depleted, wasted | inventory_batches.status |
| `order_source` | website, syrve, manual | orders.source |
| `order_status` | new, preparing, ready, delivered, cancelled | orders.status |
| `plan_status` | draft, active, completed | production_plans.status |

## RPCs & Triggers

| Function | Type | Purpose | Migration |
|---|---|---|---|
| `fn_start_production_task(UUID)` | RPC | Start cook task, freeze BOM snapshot | 016 |
| `fn_predictive_procurement(UUID)` | RPC | Recursive BOM walk, shortage calc | 017 |
| `fn_generate_barcode()` | UTIL | 8-char alphanumeric barcode | 018 |
| `fn_create_batches_from_task(UUID, JSONB)` | RPC | Create batches + complete task | 018 |
| `fn_open_batch(UUID)` | RPC | Open batch, shrink expires_at +12h | 018 |
| `fn_transfer_batch(TEXT, TEXT)` | RPC | Move batch by barcode, log transfer | 018 |
| `fn_update_cost_on_purchase()` | TRIGGER FN | Auto-update nomenclature.cost_per_unit on purchase | 021 |
| `fn_process_new_order(UUID)` | RPC | BOM explosion: order items -> production tasks | 022 |
| `fn_run_mrp(UUID)` | RPC | 2-level MRP engine: SALE->PF/MOD->RAW, inventory deduction | 023 |
| `fn_approve_plan(UUID)` | RPC | Convert prep_schedule to production_tasks | 023 |
| `fn_set_updated_at()` | TRIGGER FN | Generic updated_at setter | 021 |
| `sync_equipment_last_service()` | TRIGGER FN | Auto-update equipment.last_service_date | pre-existing |

## Storage Buckets

| Bucket | Public | Max Size | MIME Types | Purpose |
|---|---|---|---|---|
| `receipts` | Yes (read) | 5 MB | JPEG, PNG, WebP, PDF | Expense receipt storage (supplier/, bank/, tax/) |

## Related

- [[Shishka OS Architecture]] -- System overview and module map
- [[Financial Ledger]] -- Finance module details
- [[STATE]] -- Migration deployment history
