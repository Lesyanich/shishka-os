---
title: Database Domain Contracts
type: page
tags: [database, contracts, ownership]
date: 2026-04-29
status: active
related:
  - "[[Database/]]"
  - "[[Database/RLS Policies]]"
  - "[[Tech/MCP Servers]]"
---

# Database Domain Contracts

Source: [`docs/domain/db-contracts.md`](../../docs/domain/db-contracts.md). The HC-2 ("Contracts in Code, Not in Text") rule: each table has **one domain owner**; cross-domain access is read-only unless explicitly noted.

## Ownership matrix

| Table | Owner Domain | Owner MCP | Read Access | Notes |
|---|---|---|---|---|
| `nomenclature` (products) | Chef | `mcp-chef` | finance, admin | All four product types: RAW, PF, MOD, SALE |
| `bom_structures` | Chef | `mcp-chef` | admin | Recipe ingredients (BOM tree) |
| `recipes_flow` | Chef | `mcp-chef` | admin | Production routing instructions |
| `supplier_catalog` | Chef | `mcp-chef` | finance | Supplier-product mapping, pricing SSoT |
| `sku_barcodes` | Chef | `mcp-chef` | admin | Barcode → product mapping |
| `equipment` | Chef | `mcp-chef` | admin | Kitchen equipment registry |
| `production_orders` | Chef | `mcp-chef` | admin | Kitchen production batches |
| `inventory_levels` | Chef | `mcp-chef` | finance | Current stock |
| `waste_log` | Chef | `mcp-chef` | finance | Waste tracking |
| `financial_transactions` | Finance | `mcp-finance` | admin | Ledger entries |
| `capex_assets` | Finance | `mcp-finance` | admin | Capital assets |
| `capex_transactions` | Finance | `mcp-finance` | admin | Asset purchase / disposal events |
| `receipt_jobs` | Finance | `mcp-finance` | admin | Receipt processing queue |
| `receipt_inbox` / `inbox` | Finance | `mcp-finance` | admin | Receipt inbox |
| `business_tasks` | Mission Control | `mcp-mission-control` | all | Cross-domain backlog |
| `business_initiatives` | Mission Control | `mcp-mission-control` | all | Grouped projects |
| `sprints` | Mission Control | `mcp-mission-control` | all | Sprint planning |
| `task_comments` | Mission Control | `mcp-mission-control` | all | Task comments |
| `migration_log` | Infrastructure | — | all | Migration tracking (read-only for everyone) |

## Rules

1. **Write access** belongs ONLY to the owner MCP server.
2. **Read access** is granted to listed consumers — currently enforced at the code layer (ESLint), planned to enforce at the DB layer in Phase D ([[Database/RLS Policies]]).
3. **Shared types** live in `services/supabase/types/` — the only allowed cross-MCP import path. Any MCP needing a type defined in another domain imports from there, not from the foreign MCP's source.
4. **Admin panel** accesses ALL tables via the Supabase client (anon key + RLS) — never imports from MCP servers directly.

## Enforcement layers

| Layer | Mechanism | Status |
|---|---|---|
| Code imports | ESLint `no-restricted-imports` | **Active** (Phase A) |
| DB access | Supabase RLS policies | **Planned** (Phase D — per-MCP service keys) |
| TypeScript | Shared types in `services/supabase/types/` | **Active** |

The ESLint rule rejects e.g. `import { somethingChef } from '@shishka/mcp-chef/...'` from inside `mcp-finance/`. Only the shared `types/` folder can cross domains in code.

## Phase D plan — per-MCP service keys

When the team or surface-area grows enough to need DB-level enforcement:

1. **Per-MCP Supabase service accounts** — `mcp_chef_role`, `mcp_finance_role`, `mcp_mc_role`
2. **Replace `USING (true)`** with role-based checks — see [[Database/RLS Policies]] for SQL examples
3. **Issue per-MCP API keys** — each MCP server's `.env` gets a unique key mapping to its role
4. **Test coverage** — verify no cross-domain writes in MCP tool tests (TBD pre-Phase-D)

Estimated effort: 2–3 migrations + key rotation. ~1 session.

## Why this matters operationally

Today (Phase A):
- A bug in `mcp-finance` could (in principle) corrupt `nomenclature` rows owned by chef domain
- Code-layer enforcement (ESLint) catches this at import time, not at runtime — sufficient for current trust level

Tomorrow (Phase D):
- Even if `mcp-finance` constructed a bypass, the DB rejects the write
- Audit trail naturally emerges — every write is attributable to a specific service-role key

## See Also

- [[Database/RLS Policies]] — security implementation
- [[Tech/MCP Servers]] — the MCP servers this contract governs
- [`docs/domain/db-contracts.md`](../../docs/domain/db-contracts.md)
- `services/supabase/types/` — the shared types directory
