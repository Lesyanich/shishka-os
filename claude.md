# CLAUDE.md — Shishka OS Context Router v2.0

## Identity
Shishka Healthy Kitchen ERP ecosystem. Multiple projects, one Supabase backend.
Language: Russian for documentation, English for code and variables.

## L0: Always Load (every session)
1. Read `docs/context/constitution/p0-rules.md` before any task.
2. Read `docs/context/state/CURRENT.md` for global state.

## Project Detection
Determine the active project before loading module context:

| Signal | Project |
|--------|---------|
| Path contains `admin-panel` | admin |
| Path contains `shishka-web` | web |
| Path contains `shishka-app` | app |
| Path contains `supabase/` or `gas/` | backend (shared) |
| Branch: `feature/admin/*` | admin |
| Branch: `feature/web/*` | web |
| Branch: `feature/app/*` | app |

If ambiguous — ASK: "Which project? admin, web, or app?"

## L1: Project Context (load after detecting project)

| Project | State | Frontend Rules |
|---------|-------|----------------|
| admin | `docs/context/projects/admin/CURRENT.md` | `docs/context/projects/admin/frontend-rules.md` |
| web | `docs/context/projects/web/CURRENT.md` | `docs/context/projects/web/frontend-rules.md` |
| app | `docs/context/projects/app/CURRENT.md` | `docs/context/projects/app/frontend-rules.md` |

## L2: Module Context (load when working on a specific module)

Project modules: `docs/context/projects/{project}/modules/{module}.md`

| Module | File |
|--------|------|
| Finance | `modules/finance.md` |
| Receipts / OCR | `modules/receipts.md` |
| Inventory | `modules/inventory.md` |
| Kitchen / KDS | `modules/kitchen.md` |
| BOM / Nomenclature | `modules/bom.md` |
| Procurement | `modules/procurement.md` |

## Shared Domain (cross-project business logic)

| Domain | File |
|--------|------|
| Nomenclature (RAW/PF/MOD/SALE) | `docs/context/shared/nomenclature.md` |
| Nutrition / KBZHU | `docs/context/shared/nutrition.md` |
| Financial codes & tax | `docs/context/shared/financial-codes.md` |
| UoM conversions | `docs/context/shared/uom.md` |
| Supplier / SKU model | `docs/context/shared/supplier-domain.md` |
| DB Schema (lightweight) | `docs/context/shared/db-schema-summary.md` |

## L3: On-demand (load only when explicitly needed)

| Resource | File |
|----------|------|
| Full DB Schema (30KB) | `02_Obsidian_Vault/Architecture/Database Schema.md` |
| Handover history | `02_Obsidian_Vault/Handover/HANDOVER.md` |
| Architecture notes | `02_Obsidian_Vault/Architecture/*.md` |
| Phase history | `docs/context/phases/phase-N-*.md` |
| Boris Rules | `docs/context/constitution/boris-rules.md` |
| Keys & Secrets | `docs/context/state/keys-config.md` |
| Frontend blueprint | `docs/PLAN-ShishkaOS-Dashboard.md` |
| Tech debt (admin) | `docs/context/projects/admin/tech-debt.md` |

## Context Switching Protocol

When switching projects ("stop admin, switch to web"):
1. Write WIP section to `docs/context/projects/{current}/CURRENT.md`
2. Ask: "Commit WIP before switching?" -> `git commit -m "wip: [desc]"`
3. Switch branch: `git checkout feature/{new-project}/...`
4. Load new project context (L1)
5. Report new project state

## Compound Engineering (Boris Rule)
If you make a mistake and the user corrects you, update the relevant
file in `docs/context/constitution/`, `docs/context/shared/`, or `docs/context/projects/`.

## Commit Gate (Boris Rule #11)
NEVER `git push` until:
1. Global `docs/context/state/CURRENT.md` updated (if cross-project change)
2. Project `docs/context/projects/{project}/CURRENT.md` updated
3. `02_Obsidian_Vault/Architecture/Database Schema.md` updated (if schema changed)
4. **Architecture note synced** for each modified module (if note exists):
   - Receipts/OCR → `Architecture/Receipt Routing Architecture.md`
   - Finance → `Architecture/Financial Ledger.md`
   - Procurement → `Architecture/Procurement & Receiving Architecture.md`
   - Categories → `Architecture/Product Categorization Architecture.md`
   - System-wide → `Architecture/Shishka OS Architecture.md`
5. All staged in the commit

## Obsidian Protocol (Boris Rule #9)
After each major phase, create/update an architecture note in
`02_Obsidian_Vault/Architecture/` with YAML frontmatter, wikilinks, Mermaid diagrams.
Archive obsolete content to `02_Obsidian_Vault/_Archive/`.

## Git Workflow
Branch naming: `feature/{project}/description` or `feature/shared/description`.
Never commit directly to `main` during active development.
