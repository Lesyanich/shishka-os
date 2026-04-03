# CLAUDE.md — Shishka OS Context Router v3.0

## Identity
Shishka Healthy Kitchen ERP ecosystem. Multiple projects, one Supabase backend.
Language: Russian for documentation, English for code and variables.

## L0: Always Load (every session)
1. Read `docs/constitution/p0-rules.md` before any task.
2. Read `STATUS.md` for global state.

## Project Detection
Determine the active project before loading module context:

| Signal | Project |
|--------|---------|
| Path contains `apps/admin-panel` | admin |
| Path contains `apps/web` | web |
| Path contains `apps/app` | app |
| Path contains `services/supabase` or `services/gas` | backend (shared) |
| Branch: `feature/admin/*` | admin |
| Branch: `feature/web/*` | web |
| Branch: `feature/app/*` | app |

If ambiguous — ASK: "Which project? admin, web, or app?"

## L1: Project Context (load after detecting project)

| Project | State | Frontend Rules |
|---------|-------|----------------|
| admin | `docs/projects/admin/CURRENT.md` | `docs/constitution/frontend-rules.md` |
| web | `docs/projects/web/CURRENT.md` | `docs/constitution/frontend-rules.md` |
| app | `docs/projects/app/CURRENT.md` | `docs/constitution/frontend-rules.md` |

## L2: Module Context (load when working on a specific module)

| Module | File |
|--------|------|
| Finance | `docs/modules/finance.md` |
| Receipts / OCR | `docs/modules/receipts.md` |
| Inventory | `docs/modules/inventory.md` |
| Kitchen / KDS | `docs/modules/kitchen.md` |
| BOM / Nomenclature | `docs/modules/bom.md` |
| Procurement | `docs/modules/procurement.md` |

## Shared Domain (cross-project business logic)

| Domain | File |
|--------|------|
| Nomenclature (RAW/PF/MOD/SALE) | `docs/domain/nomenclature.md` |
| Nutrition / KBZHU | `docs/domain/nutrition.md` |
| Financial codes & tax | `docs/domain/financial-codes.md` |
| UoM conversions | `docs/domain/uom.md` |
| Supplier / SKU model | `docs/domain/supplier-domain.md` |
| DB Schema (lightweight) | `docs/domain/db-schema-summary.md` |

## Agent Context (load when working with an agent)

| Agent | Brains | Hands (MCP) |
|-------|--------|-------------|
| Chef | `agents/chef/AGENT.md` | `services/mcp-chef/` |
| Finance | `agents/finance/AGENT.md` | `services/mcp-finance/` |
| Invoice Parser | `agents/invoice-parser/AGENT.md` | (uses Finance MCP) |

## L3: On-demand (load only when explicitly needed)

| Resource | File |
|----------|------|
| Full DB Schema (30KB) | `vault/Architecture/Database Schema.md` |
| Handover history | `vault/Handover/HANDOVER.md` |
| Architecture notes | `vault/Architecture/*.md` |
| Phase history | `docs/phases/phase-N-*.md` |
| Boris Rules | `docs/constitution/boris-rules.md` |
| Keys & Secrets | `docs/keys-config.md` |
| Frontend blueprint | `docs/plans/dashboard-blueprint.md` |
| Tech debt | `docs/tech-debt.md` |

## Context Switching Protocol

When switching projects ("stop admin, switch to web"):
1. Write WIP section to `docs/projects/{current}/CURRENT.md`
2. Ask: "Commit WIP before switching?" -> `git commit -m "wip: [desc]"`
3. Switch branch: `git checkout feature/{new-project}/...`
4. Load new project context (L1)
5. Report new project state

## Compound Engineering (Boris Rule)
If you make a mistake and the user corrects you, update the relevant
file in `docs/constitution/`, `docs/domain/`, or `docs/projects/`.

## Commit Gate (Boris Rule #11)
NEVER `git push` until:
1. Global `STATUS.md` updated (if cross-project change)
2. Project `docs/projects/{project}/CURRENT.md` updated
3. `vault/Architecture/Database Schema.md` updated (if schema changed)
4. **Architecture note synced** for each modified module (if note exists):
   - Receipts/OCR -> `vault/Architecture/Receipt Routing Architecture.md`
   - Finance -> `vault/Architecture/Financial Ledger.md`
   - Procurement -> `vault/Architecture/Procurement & Receiving Architecture.md`
   - Categories -> `vault/Architecture/Product Categorization Architecture.md`
   - System-wide -> `vault/Architecture/Shishka OS Architecture.md`
5. All staged in the commit

## Obsidian Protocol (Boris Rule #9)
After each major phase, create/update an architecture note in
`vault/Architecture/` with YAML frontmatter, wikilinks, Mermaid diagrams.
Archive obsolete content to `vault/_Archive/`.

## Git Workflow
Branch naming: `feature/{project}/description` or `feature/shared/description`.
Never commit directly to `main` during active development.
