# Database Table Contracts (HC-2)

> **Purpose:** Reference for humans and ESLint/RLS enforcement.
> Each table has ONE domain owner. Cross-domain access is read-only unless explicitly noted.
> Spec: `docs/plans/spec-ai-native-ops.md` (HC-2: Contracts in Code, Not in Text)

## Ownership Matrix

| Table | Owner Domain | Owner MCP | Read Access | Notes |
|-------|-------------|-----------|-------------|-------|
| `products` | Chef | mcp-chef | finance (read), admin (read) | All items: RAW, PF, MOD, SALE |
| `bom_lines` | Chef | mcp-chef | admin (read) | Recipe ingredients |
| `recipe_flow_steps` | Chef | mcp-chef | admin (read) | Production instructions |
| `supplier_catalog` | Chef | mcp-chef | finance (read) | Supplier-product mapping, pricing SSoT |
| `sku_barcodes` | Chef | mcp-chef | admin (read) | Barcode-to-product mapping |
| `equipment` | Chef | mcp-chef | admin (read) | Kitchen equipment registry |
| `production_orders` | Chef | mcp-chef | admin (read) | Kitchen production batches |
| `inventory_levels` | Chef | mcp-chef | finance (read) | Current stock |
| `waste_log` | Chef | mcp-chef | finance (read) | Waste tracking |
| `financial_transactions` | Finance | mcp-finance | admin (read) | Ledger entries |
| `receipt_jobs` | Finance | mcp-finance | admin (read) | Receipt processing queue |
| `inbox` | Finance | mcp-finance | admin (read) | Receipt inbox |
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
- **mcp-chef key:** r/w `products`, `bom_lines`, `recipe_flow_steps`, `supplier_catalog`, `equipment`, `production_orders`, `inventory_levels`, `waste_log`, `sku_barcodes` — read-only on `financial_transactions`
- **mcp-finance key:** r/w `financial_transactions`, `receipt_jobs`, `inbox` — read-only on `products`, `supplier_catalog`
- **mcp-mission-control key:** r/w `business_tasks`, `business_initiatives`, `sprints` — read-only on all other tables
