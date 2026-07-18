---
title: Database
type: entity
tags: [database, schema, supabase]
date: 2026-07-18
status: active
related:
  - "[[Tech/Stack]]"
  - "[[Recipes/BOM Structure]]"
  - "[[Finance/Ledger]]"
---

# Database

The Supabase PostgreSQL backend — the single source of truth for all operational data (orders, inventory, receipts, ledger, equipment, recipes). Per `RULE-SUPABASE-SSOT`: **Supabase is the only source of truth; the admin UI is a mirror.**

> [!info] Hub page
> This is a navigation hub. It deliberately carries **no live counts** (table / migration / policy totals drift the moment they're written). For the current shape, go to the source of truth each sub-page names.

## Sub-pages

- [[Database/Schema]] — full schema diagram + table list (start here for current shape)
- [[Database/Migrations]] → pointer to `services/supabase/migrations/`
- [[Database/RPC Catalog]] → pointer to the defining migrations + live `pg_proc`
- [[Database/RLS Policies]] → pointer to the live Supabase security advisors + April audit
- [[Database/Domain Contracts]] → pointer to `docs/domain/db-contracts.md`

## Where things live

| Asset | Location |
|---|---|
| Project | `qcqgtcsjoacuktcewpvo` (Supabase, ap-south-1) |
| Migrations | `services/supabase/migrations/` (append-only ledger) |
| Shared types | `services/supabase/types/` (only allowed cross-MCP import path) |
| MCP servers (DB writers) | `services/mcp-chef/`, `services/mcp-finance/`, `services/mcp-mission-control/` |
| Admin client | `apps/admin-panel/src/lib/supabase.ts` (anon key + RLS) |

## Constitution rules touching DB

- **`RULE-SUPABASE-SSOT`** — Supabase is the ONLY source of truth (admin UI is a mirror)
- **`RULE-NO-DIRECT-DB-EDITS`** — schema changes only via SQL migrations
- **`RULE-MIGRATIONS-PATH`** — new migrations to `services/supabase/migrations/`, sequentially numbered
- **`RULE-MIGRATION-COLUMN-EXISTENCE`** — production may have skipped migrations; check column existence before referencing

## Adjacent entities

- [[Tech/Stack]] · [[Tech/MCP Servers]] · [[Recipes/BOM Structure]] · [[Finance/Ledger]] · [[Operations/KDS]]

> _Stale-stat block ("~50 tables / 164 migrations") removed in the 2026-07-18 wiki staleness audit — those numbers were a 2026-04-29 snapshot and had drifted badly._
