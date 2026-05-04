---
title: Database
type: entity
tags: [database, schema, supabase]
date: 2026-04-29
status: active
related:
  - "[[Tech/Stack]]"
  - "[[Recipes/BOM Structure]]"
  - "[[Finance/Ledger]]"
---

# Database

The schema, RLS, migrations, and RPC catalog of the Supabase project. Single source of truth for all operational data — orders, inventory, receipts, ledger, equipment, recipes. Per the `RULE-SUPABASE-SSOT` constitution rule: **Supabase is the only source of truth; the admin UI is a mirror**.

> [!info] One-line definition
> Database is Shishka's central nervous system — Supabase PostgreSQL 17.6 with RLS, ~164 sequential migrations, owned domain-by-domain by MCP servers (`mcp-chef`, `mcp-finance`, `mcp-mission-control`).

## Sub-pages

- [[Database/Schema]] — full schema diagram + table list (moved from `Architecture/`)
- [[Database/Migrations]] — migration index + how to add new ones
- [[Database/RLS Policies]] — current state of Row-Level Security + Phase-D plan
- [[Database/Domain Contracts]] — table ownership matrix + cross-domain access rules
- [[Database/RPC Catalog]] — Postgres functions exposed via MCP

## Where things live

| Asset | Location |
|---|---|
| Project | `qcqgtcsjoacuktcewpvo` (Supabase, ap-south-1) |
| Migrations directory | `services/supabase/migrations/` (164 sequential SQL files) |
| Shared types | `services/supabase/types/` (only allowed cross-MCP import path) |
| MCP servers (DB writers) | `services/mcp-chef/`, `services/mcp-finance/`, `services/mcp-mission-control/` |
| Admin client | `apps/admin-panel/src/lib/supabase.ts` (anon key + RLS) |
| Bible source | `docs/domain/db-schema-summary.md`, `docs/domain/db-contracts.md` |

## Quick stats

| | |
|---|---|
| PostgreSQL version | 17.6 |
| Region | ap-south-1 |
| Tables (approx) | ~50 |
| RLS-enabled | Yes (every table) |
| Migrations | 164 (as of 2026-04-29) |
| MCP servers writing | 3 (chef, finance, mission-control) |

## Domains in DB

| Domain | Owner MCP | Key tables |
|---|---|---|
| **Chef** | `mcp-chef` | `nomenclature` (products), `bom_structures`, `recipes_flow`, `supplier_catalog`, `equipment`, `production_orders`, `inventory_levels`, `waste_log` |
| **Finance** | `mcp-finance` | `financial_transactions`, `receipt_jobs`, `receipt_inbox`, `capex_assets`, `capex_transactions`, `fin_categories` |
| **Mission Control** | `mcp-mission-control` | `business_tasks`, `business_initiatives`, `sprints`, `task_comments` |
| **Infrastructure** | — | `migration_log` (read-only for all) |

See [[Database/Domain Contracts]] for the full ownership matrix and cross-domain access rules.

## Adjacent entities

- [[Tech/Stack]] — Supabase + the broader stack
- [[Tech/MCP Servers]] — the MCP servers that own these tables
- [[Recipes/BOM Structure]] — `nomenclature` + `bom_structures` table-level view
- [[Finance/Ledger]] — `financial_transactions` table-level view
- [[Procurement/Suppliers]] — `supplier_catalog` + `suppliers`
- [[Operations/KDS]] — `production_orders` + `staff` auth

## Constitution rules touching DB

- **`RULE-SUPABASE-SSOT`** — Supabase is the ONLY source of truth (admin UI is a mirror)
- **`RULE-NO-DIRECT-DB-EDITS`** — only via SQL migrations (no production data dabbling via psql or Supabase studio)
- **`RULE-MIGRATIONS-PATH`** — new migrations to `services/supabase/migrations/`, sequentially numbered (see Auto Memory `feedback_migrations_path.md`)
- **`RULE-MIGRATION-COLUMN-EXISTENCE`** — production may have skipped migrations; check column existence before referencing (see Auto Memory `feedback_migration_safety.md`)

## See Also

- [[Database/Schema]] — the moved Architecture/Database Schema page
- [[Database/Migrations]] — index of ~164 migrations
- [[Database/RLS Policies]] — security status
- `docs/domain/db-schema-summary.md`
- `docs/domain/db-contracts.md`
