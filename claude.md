# CLAUDE.md — Shishka OS Context Router v3.0

## Identity
Shishka Healthy Kitchen ERP ecosystem. Multiple projects, one Supabase backend.
Language: Russian for documentation, English for code and variables.

## L0: Always Load (every session)
1. Read `docs/constitution/p0-rules.md` before any task.
2. Read `STATUS.md` for global state.
3. Read `docs/plans/QUEUE.md` for active task queue.

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

## LK: Knowledge Base / Bible (load for business-context tasks)

> **Routing manifest**: `docs/bible/INDEX.md` — load this first, then only the files relevant to your domain/task.

| Topic | File | Domains |
|-------|------|---------|
| Brand & Identity | `docs/bible/identity.md` | all |
| Menu Concept & CBS | `docs/bible/menu-concept.md` | kitchen, marketing |
| Menu Items (dishes) | `docs/bible/menu-items.md` | kitchen, procurement, sales |
| Operations (L1→L2) | `docs/bible/operations.md` | kitchen, ops |
| Locations & Phases | `docs/bible/locations.md` | ops, strategy, finance |
| Equipment Registry | `docs/bible/equipment.md` | kitchen, ops, procurement |
| Benchmarks | `docs/bible/benchmarks.md` | strategy, marketing |
| Financial Targets | `docs/bible/targets.md` | finance, strategy |
| External Sources | `docs/bible/sources.md` | all |

**Protocol**: Agents read INDEX.md → load only their files → if they discover new knowledge, create `field_note` in Supabase (NOT edit bible directly). Only CEO-approved content lands in bible files.

## Shared Domain (cross-project business logic)

| Domain | File |
|--------|------|
| Nomenclature (RAW/PF/MOD/SALE) | `docs/domain/nomenclature.md` |
| Nutrition / KBZHU | `docs/domain/nutrition.md` |
| Financial codes & tax | `docs/domain/financial-codes.md` |
| UoM conversions | `docs/domain/uom.md` |
| Supplier / SKU model | `docs/domain/supplier-domain.md` |
| DB Schema (lightweight) | `docs/domain/db-schema-summary.md` |

## Business Context (load when user shares a business idea or task)

| Resource | File |
|----------|------|
| Dispatch rules (routing matrix) | `docs/business/DISPATCH_RULES.md` |
| Domain context (per department) | `docs/business/domains/{domain}.md` |
| Initiative template | `docs/business/initiatives/_template.md` |

When user shares a business idea → read `DISPATCH_RULES.md` → create task(s) in Supabase `business_tasks`.
When idea spans 3+ domains → create `business_initiative` + linked tasks.

## Agent Context (load when working with an agent)

> **Before any agent work:** read `docs/constitution/agent-tracking.md`

| Agent | Brains | Hands (MCP) |
|-------|--------|-------------|
| Chef | `agents/chef/AGENT.md` | `services/mcp-chef/` |
| Finance | `agents/finance/AGENT.md` | `services/mcp-finance/` |
| Invoice Parser | `agents/invoice-parser/AGENT.md` | (uses Finance MCP) |
| Dispatcher | `docs/business/DISPATCH_RULES.md` | (planned: `services/mcp-dispatcher/`) |

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
