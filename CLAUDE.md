# CLAUDE.md — Shishka OS Context Router v5.0

## Identity
Shishka Healthy Kitchen ERP. Multiple projects, one Supabase backend.

## Language Contract (RULE-LANGUAGE-CONTRACT)
- **Conversation with humans:** the human's language. CEO is Russian-speaking → reply in Russian. Partner Arabic → Arabic. Contractor English → English.
- **Storage (DB, MC tasks, code, comments, commits, specs, AGENT.md, schemas):** **English only**, no exceptions.
- **Translation is the receiving agent's job** — translate at the boundary, before writing to MC.
- Verbatim CEO quotes allowed in `notes` field with `«guillemets»` when nuance matters.
- Full rule: `docs/constitution/core-rules.md` § RULE-LANGUAGE-CONTRACT.

## L0: Session Start (MANDATORY, every session)
1. Read `docs/constitution/core-rules.md` (foundational — was p0-rules.md, renamed 2026-04-07). For code/DB tasks, also load `docs/constitution/engineering-rules.md`. For agent behavior questions, load `docs/constitution/agent-rules.md`.
2. **Query MemPalace for Shishka Wing context (optional, ~170 tokens).** If the `shishka-mempalace` MCP server is listed in ToolSearch, call its wake-up tool for the `Shishka` wing. This surfaces cross-session decisions, CEO preferences, and recent pivots WITHOUT reading the last 20 MC Running Log comments manually. Skip silently if the server is absent (fresh machine, pre-restart, or Phase 2 not deployed yet). See `agents/*/AGENT.md` § Memory for routing between layers.
3. **Pick up your task from MC (ordered):**
   - `list_tasks(status="in_progress")` → continue from previous agent's `notes`
   - If empty → filter by `tag="coo-autonomous"` on inbox → autonomous lane (see `RULE-AUTONOMOUS-LANE` in `agent-rules.md`); verify `kind:*` is on whitelist before picking up, refuse blacklisted combinations
   - If empty → `list_tasks(status="inbox", priority="critical")` → propose to user
4. **Load task context:** `get_task(id)` → read `spec_file` + `context_files` + `notes`
5. **Skills routing (tech tasks only):** Read the `kind:*` tag from `get_task(id).tags`. Open `docs/operations/skills-services-policy.md` → "Kind → Skills mapping" subsection. Load all REQUIRED skills before first edit. Treat FORBIDDEN as a hard constraint, RECOMMENDED as judgment. If a tech-domain task has no `kind:*` tag → post a comment to the task asking COO for clarification and STOP. Do not guess.
6. If task has `context_files` → load ONLY those + `core-rules.md`. **Skip L1/L2.**
7. If no context_files → use L1/L2 routing below

> **Workflow skill:** Read `.claude/skills/task-lifecycle/SKILL.md` for complete
> session start → work → test → PR → MC update protocol.

## Dispatcher: Agent Routing

**Slash commands** — user explicitly selects agent mode:

| Command | Agent | What it loads |
|---------|-------|--------------|
| `/chef` | Chef Agent | `agents/chef/AGENT.md` + kitchen MCP tools + MC tasks (domain=kitchen) |
| `/finance` | Finance Agent | `agents/finance/AGENT.md` + finance MCP tools + receipt inbox |
| `/coo` | Auto-router | Classifies incoming message (tech vs strategic signals) and loads `/strategy` or `/techlead` — see spec `docs/plans/spec-agents-split.md` §3.1 |
| `/strategy` | Strategic COO | `agents/strategy/AGENT.md` + `core-rules.md` + `agent-rules.md` + `DISPATCH_RULES.md` + MemPalace `wing_strategy` — business direction, CEO idea capture, cross-domain priorities, `kind:meta` ownership |
| `/techlead` | Technical Tech-Lead | `agents/tech-lead/AGENT.md` + `core-rules.md` + `agent-rules.md` + `engineering-rules.md` + `skills-services-policy.md` + MemPalace `wing_tech` — tech task graph, `/code` handoffs, MC hygiene, engineering compound-engineering |

> **COO split (2026-04-08):** The monolithic COO has been split into Strategic COO and Technical Tech-Lead per `docs/plans/spec-agents-split.md`. `/coo` is now a thin auto-router. `agents/coo/AGENT.md` is a deprecation stub — do not load it directly.

**Auto-routing** — if user sends free text without selecting an agent, classify intent:

| Signal in text | Domain | Agent |
|----------------|--------|-------|
| receipt, invoice, expense, supplier, cost report, spending | finance | `/finance` |
| dish, menu, BOM, recipe, ingredient, nutrition, product, calorie | kitchen | `/chef` |
| PR #, task UUID, bug, fix, deploy, routing, handoff, MC RPC, commit, merge, CI, context_files, tag, dup, triage, blocked, RULE-*, /code, feature-branch, engineering-rules, kind:* | tech | `/techlead` (via `/coo` router or directly) |
| roadmap, milestone, priority, стратегия, бизнес, решили, давай, хочу чтобы, нам нужна, идея, проблема с, что в приоритете, initiative, cross-domain trade-off, kind:meta | strategy / ops | `/strategy` (via `/coo` router or directly) |
| queue, inbox, triage, priority, initiative, sprint, coordination (mechanical hygiene) | ops | `/techlead` (hygiene lives with Tech-Lead); priority re-ranking of initiatives → `/strategy` |
| ambiguous | — | `/strategy` (tie-breaker per spec §2.3) — captures first, reclassifies after clarification |

**After routing:** load the agent's AGENT.md, check MC tasks for that domain, report status, ask what to do.

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
Agents: `agents/{name}/AGENT.md` + `docs/constitution/agent-rules.md` (was agent-tracking.md, renamed 2026-04-07).
Reference: `knowledge/` (ai-learning, industry, phases — ~13MB total). Cooking PDFs archived 2026-04-07: see Dead Zones.

## L3: On-demand
DB Schema → `vault/Architecture/Database Schema.md`. Architecture → `vault/Architecture/*.md`. Engineering Rules → `docs/constitution/engineering-rules.md` (was boris-rules.md, renamed 2026-04-07). Keys → `docs/keys-config.md`.

## Dead Zones (DO NOT load, DO NOT reference for new work)

| Path | Why |
|------|-----|
| `services/gas/` | DEPRECATED — legacy GAS+Gemini receipt parser, replaced by Finance Agent |
| `services/supabase/functions/parse-receipts/` | DEPRECATED — proxy to GAS, dead |
| `services/supabase/functions/update-receipt-job/` | DEPRECATED — GAS callback, dead |
| `_archive/` | Global archive — historical snapshots, old menu/equipment .md files, vault leftovers |
| `_archive/cookbooks/` | 386 cookbook PDFs (1.8GB) archived 2026-04-07 — Claude's training corpus already covers the famous references (Sharma, Segnit, Lahousse, McGee, Modernist Cuisine, etc.); book RAG was abandoned. Personal reference only, not for agent context. |
| `04_Knowledge/` | **REMOVED** — consolidated into `knowledge/` and `_archive/` (2026-04-06) |

## Rules (enforced)

**Compound Engineering:** If user corrects you → update `docs/constitution/`, `docs/domain/`, or `docs/projects/`.

**Commit Gate:** NEVER `git push` until MC task updated + CURRENT.md updated + architecture notes synced (if schema/module changed). STATUS.md auto-generates — never edit manually.

**Git:** Branches: `feature/{project}/description` or `feature/shared/description`. Never commit to `main` directly.

**Task completion:** Follow `.claude/skills/task-lifecycle/SKILL.md` — test → MC update → push → PR.

