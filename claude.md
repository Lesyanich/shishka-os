# CLAUDE.md — Shishka OS Context Router

## Identity
Shishka Healthy Kitchen ERP/KDS (React + Vite + Tailwind v4 + Supabase).
Language: Russian for documentation, English for code and variables.

## Auto-Load (every session)
Read `docs/context/constitution/p0-rules.md` before any task.

## Context Routing — Read BEFORE working on a module

| Task / Module          | Read these files (in order)                              |
|------------------------|----------------------------------------------------------|
| **Any task**           | `docs/context/state/CURRENT.md`                          |
| **Database / Schema**  | `02_Obsidian_Vault/Database Schema.md`                   |
| **Finance**            | `docs/context/modules/finance.md`                        |
| **Receipts / OCR**     | `docs/context/modules/receipts.md`                       |
| **Inventory**          | `docs/context/modules/inventory.md`                      |
| **Kitchen / KDS**      | `docs/context/modules/kitchen.md`                        |
| **BOM / Nomenclature** | `docs/context/modules/bom.md`                            |
| **Procurement**        | `docs/context/modules/procurement.md`                    |
| **Frontend rules**     | `docs/context/constitution/frontend-rules.md`            |
| **Boris Rules ref**    | `docs/context/constitution/boris-rules.md`               |
| **Keys & Secrets**     | `docs/context/state/keys-config.md`                      |
| **Phase history**      | `docs/context/phases/phase-N-*.md` (by topic)            |
| **Architecture**       | `02_Obsidian_Vault/Shishka OS Architecture.md`           |
| **Handover report**    | `02_Obsidian_Vault/Handover/HANDOVER.md`                 |
| **Frontend blueprint** | `docs/PLAN-ShishkaOS-Dashboard.md`                       |
| **Tech debt**          | `docs/context/state/tech-debt.md`                        |

## Compound Engineering (Boris Rule)
If you make a mistake and the user corrects you, update the relevant
file in `docs/context/constitution/` or `docs/context/modules/`.

## Commit Gate (Boris Rule #11)
NEVER `git push` until:
1. `docs/context/state/CURRENT.md` reflects the changes
2. `02_Obsidian_Vault/Database Schema.md` updated (if schema changed)
3. Both staged in the commit

## Obsidian Protocol (Boris Rule #9)
After each major phase, create/update an architecture note in
`02_Obsidian_Vault/` with YAML frontmatter, wikilinks, Mermaid diagrams.
Archive obsolete content to `02_Obsidian_Vault/_Archive/`.

## Git Workflow
Create a feature branch (`feature/phase-N-name`) for every major phase.
Never commit directly to `main` during active development.
