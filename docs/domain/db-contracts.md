# Database Table Contracts (HC-2)

> **Purpose:** Reference for humans and ESLint/RLS enforcement.
> Each table has ONE domain owner. Cross-domain access is read-only unless explicitly noted.
> Spec: `docs/plans/spec-ai-native-ops.md` (HC-2: Contracts in Code, Not in Text)
>
> **Freshness:** table names refreshed 2026-07-18 against live DB (`qcqgtcsjoacuktcewpvo`).
> Verify against `vault/Database/Schema.md` / `list_tables` before relying on them.

## Ownership Matrix

| Table | Owner Domain | Owner MCP | Read Access | Notes |
|-------|-------------|-----------|-------------|-------|
| `nomenclature` | Chef | mcp-chef | finance (read), admin (read) | All items: RAW, PF, MOD, SALE (was `products`) |
| `bom_structures` | Chef | mcp-chef | admin (read) | Recipe ingredients (was `bom_lines`) |
| `recipes_flow` | Chef | mcp-chef | admin (read) | Production instructions (was `recipe_flow_steps`) |
| `supplier_catalog` | Chef | mcp-chef | finance (read) | Supplier-product mapping, pricing SSoT |
| `sku_identifiers` | Chef | mcp-chef | admin (read) | Barcode/identifier-to-product mapping (was `sku_barcodes`) |
| `equipment` | Chef | mcp-chef | admin (read) | Kitchen equipment registry |
| `production_orders` | Chef | mcp-chef | admin (read) | Kitchen production batches |
| `inventory_batches` / `stock_movements` | Chef | mcp-chef | finance (read) | Current stock by batch + movement log (replaced `inventory_levels`) |
| `waste_logs` | Chef | mcp-chef | finance (read) | Waste tracking (was `waste_log`) |
| `expense_ledger` | Finance | mcp-finance | admin (read) | Ledger entries (was the phantom `financial_transactions`) |
| `receipt_jobs` | Finance | mcp-finance | admin (read) | Receipt processing queue |
| `receipt_inbox` | Finance | mcp-finance | admin (read) | Receipt inbox (was `inbox`) |
| `business_tasks` | Mission Control | mcp-mission-control | all (read) | Cross-domain backlog |
| `business_initiatives` | Mission Control | mcp-mission-control | all (read) | Grouped projects |
| `sprints` | Mission Control | mcp-mission-control | all (read) | Sprint planning |
| `migration_log` | Infrastructure | — | all (read) | Migration tracking |

## Rules

1. **Write access** belongs ONLY to the owner MCP server.
2. **Read access** is granted to listed consumers — enforced by Supabase RLS (Phase D).
3. **Shared types** live in `services/supabase/types/` — the only allowed cross-MCP import path.
4. **Admin panel** accesses ALL tables via Supabase client (anon key + RLS) — never imports from MCP servers directly.

## Enforcement Layers

| Layer | Mechanism | Status |
|-------|-----------|--------|
| Code imports | ESLint `no-restricted-imports` | Phase A (active) |
| DB access | Supabase RLS policies | Phase D (planned — per-MCP service keys) |
| TypeScript | Shared types in `services/supabase/types/` | Existing |

## Future: Per-MCP Service Keys (Phase D)

Each MCP server will use its own service role key with scoped permissions:
- **mcp-chef key:** r/w `nomenclature`, `bom_structures`, `recipes_flow`, `supplier_catalog`, `equipment`, `production_orders`, `inventory_batches`/`stock_movements`, `waste_logs`, `sku_identifiers` — read-only on `expense_ledger`
- **mcp-finance key:** r/w `expense_ledger`, `receipt_jobs`, `receipt_inbox` — read-only on `nomenclature`, `supplier_catalog`
- **mcp-mission-control key:** r/w `business_tasks`, `business_initiatives`, `sprints` — read-only on all other tables
