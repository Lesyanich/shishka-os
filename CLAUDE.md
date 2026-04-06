# CLAUDE.md — Shishka OS Context Router v4.0

## Identity
Shishka Healthy Kitchen ERP. Multiple projects, one Supabase backend.
Russian for docs, English for code.

## L0: Session Start (MANDATORY, every session)
1. Read `docs/constitution/p0-rules.md`
2. **Pick up your task from MC:**
   - `list_tasks(status="in_progress")` → continue from previous agent's `notes`
   - If empty → `list_tasks(status="inbox", priority="critical")` → propose to user
3. **Load task context:** `get_task(id)` → read `spec_file` + `context_files` + `notes`
4. If task has `context_files` → load ONLY those + p0-rules. **Skip L1/L2.**
5. If no context_files → use L1/L2 routing below

> **Workflow skill:** Read `.claude/skills/task-lifecycle/SKILL.md` for complete
> session start → work → test → PR → MC update protocol.

## Project Detection
Determine the active project before loading module context:

| Signal | Project |
|--------|---------|
| Path contains `apps/admin-panel` | admin |
| Path contains `apps/web` | web |
| Path contains `apps/app` | app |
| Path contains `services/supabase` or `services/mcp-*` | backend (shared) |
| Path contains `services/gas` | **DEPRECATED** — legacy GAS pipeline, do not modify |
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

## L2: Module Context (fallback — only if task has no context_files)

Modules: Finance (`docs/modules/finance.md`), Receipts (`docs/modules/receipts.md` **LEGACY**), Inventory, Kitchen, BOM, Procurement — all in `docs/modules/`.

Specs: project-specific → `docs/projects/{project}/plans/spec-*.md`, shared → `docs/plans/spec-*.md`.

## LK: Knowledge Base
Bible: `docs/bible/INDEX.md` → load only relevant files. Domain: `docs/domain/*.md`. Business: `docs/business/DISPATCH_RULES.md`.
Agents: `agents/{name}/AGENT.md` + `docs/constitution/agent-tracking.md`.
Reference: `knowledge/` (cooking 1.9GB, industry, AI, phases).

## L3: On-demand
DB Schema → `vault/Architecture/Database Schema.md`. Architecture → `vault/Architecture/*.md`. Boris Rules → `docs/constitution/boris-rules.md`. Keys → `docs/keys-config.md`.

## Dead Zones (DO NOT load, DO NOT reference for new work)

| Path | Why |
|------|-----|
| `services/gas/` | DEPRECATED — legacy GAS+Gemini receipt parser, replaced by Finance Agent |
| `services/supabase/functions/parse-receipts/` | DEPRECATED — proxy to GAS, dead |
| `services/supabase/functions/update-receipt-job/` | DEPRECATED — GAS callback, dead |
| `_archive/` | Global archive — historical snapshots, old menu/equipment .md files, vault leftovers |
| `04_Knowledge/` | **REMOVED** — consolidated into `knowledge/` and `_archive/` (2026-04-06) |

## Rules (enforced)

**Compound Engineering:** If user corrects you → update `docs/constitution/`, `docs/domain/`, or `docs/projects/`.

**Commit Gate:** NEVER `git push` until MC task updated + CURRENT.md updated + architecture notes synced (if schema/module changed). STATUS.md auto-generates — never edit manually.

**Git:** Branches: `feature/{project}/description` or `feature/shared/description`. Never commit to `main` directly.

**Task completion:** Follow `.claude/skills/task-lifecycle/SKILL.md` — test → MC update → push → PR.

