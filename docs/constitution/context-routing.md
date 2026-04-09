# Context Routing — Layered Context Loading

> Priority: Load ONLY what the task needs. Every extra file costs tokens and dilutes focus.
>
> **This file is a fallback.** If the MC task has `context_files` → load ONLY those + `core-rules.md`. Skip this file entirely.

---

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

---

## L1: Project Context (load after detecting project)

| Project | State | Frontend Rules |
|---------|-------|----------------|
| admin | `docs/projects/admin/CURRENT.md` | `docs/constitution/frontend-rules.md` |
| web | `docs/projects/web/CURRENT.md` | `docs/constitution/frontend-rules.md` |
| app | `docs/projects/app/CURRENT.md` | `docs/constitution/frontend-rules.md` |

---

## L2: Module Context

Modules: Finance (`docs/modules/finance.md`), Receipts (`docs/modules/receipts.md` **LEGACY**), Inventory, Kitchen, BOM, Procurement — all in `docs/modules/`.

Specs: project-specific → `docs/projects/{project}/plans/spec-*.md`, shared → `docs/plans/spec-*.md`.

---

## LK: Knowledge Base

Bible: `docs/bible/INDEX.md` → load only relevant files.
Domain: `docs/domain/*.md`.
Business: `docs/business/DISPATCH_RULES.md`.
Agents: `agents/{name}/AGENT.md` + `docs/constitution/agent-rules.md`.
Reference: `knowledge/` (ai-learning, industry, phases — ~13MB total).

---

## L3: On-demand

DB Schema → `vault/Architecture/Database Schema.md`.
Architecture → `vault/Architecture/*.md`.
Engineering Rules → `docs/constitution/engineering-rules.md`.
Keys → `docs/keys-config.md`.

---

## Dead Zones (DO NOT load, DO NOT reference for new work)

| Path | Why |
|------|-----|
| `services/gas/` | DEPRECATED — legacy GAS+Gemini receipt parser, replaced by Finance Agent |
| `services/supabase/functions/parse-receipts/` | DEPRECATED — proxy to GAS, dead |
| `services/supabase/functions/update-receipt-job/` | DEPRECATED — GAS callback, dead |
| `_archive/` | Global archive — historical snapshots, old menu/equipment .md files, vault leftovers |
| `_archive/cookbooks/` | 386 cookbook PDFs (1.8GB) archived 2026-04-07 — Claude's training corpus already covers the famous references; book RAG was abandoned. Personal reference only, not for agent context. |
| `04_Knowledge/` | **REMOVED** — consolidated into `knowledge/` and `_archive/` (2026-04-06) |
