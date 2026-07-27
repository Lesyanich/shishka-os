# CLAUDE.md — Shishka OS v6.0

## Identity
Shishka Healthy Kitchen ERP. Multiple projects, one Supabase backend.

<!-- REPO-BOUNDARY-BLOCK: keep byte-identical in shishka-os/CLAUDE.md and shishka-health/CLAUDE.md -->
## Repo Boundary
Two repos, one Supabase project (`qcqgtcsjoacuktcewpvo`):
- **`shishka-os`** — everything that *writes*: migrations, admin panel, KDS, MCP services, agents.
- **`shishka-health`** — reads only: the public menu at shishka.health + the brand design system.

**Rule: whoever writes to the database is OS; whoever only shows the guest is HEALTH.**
Unsure → OS. A new field is always born in OS (migration) and only then rendered in HEALTH.

- Dish price, photo, composition → *neither repo*: admin panel or `/chef`. That is data, not code.
- Site copy in `site_content` → data lives in the DB; only the fallback defaults are HEALTH code.
- The team (`/chef`, `/finance`, `/procurement`, `/strategy`, `/techlead`) lives in OS only.
- The DB contract HEALTH depends on: `contracts/menu-contract.json`, canonical in the HEALTH repo.
<!-- /REPO-BOUNDARY-BLOCK -->

## Language Contract
- Conversation: human's language (CEO → Russian, partner → their language)
- Storage (DB, MC, code, commits, specs): English only, no exceptions
- Full rule: `docs/constitution/operational-rules.md` § RULE-LANGUAGE-CONTRACT

## Session Start (MANDATORY — 3-4 tool calls)
1. Read `docs/constitution/operational-rules.md` (foundational rules + agent behavior + routing + bible + sessions in one file)
2. Pick up task: `list_tasks(status="in_progress")` → if empty → `list_tasks(status="inbox")`
3. Load task context: `get_task(id)` → read `spec_file` + `context_files`
4. If task has `context_files` → load ONLY those + `operational-rules.md`. Skip everything else.
5. If no `context_files` → use § Context Routing in `operational-rules.md` for L1/L2/LK
6. For code/DB/frontend tasks, also load `docs/constitution/technical-rules.md`

## Agent Routing
If user sends `/chef`, `/finance`, `/strategy`, `/techlead`, `/procurement` → see `operational-rules.md` § Part IV
If user sends free text → infer domain from content, load the matching `agents/{name}/AGENT.md`.
When unsure → ask: "This sounds like [domain]. Should I load [agent]?"

## Core Principles
- **PLAN-BEFORE-BUILD:** 3+ steps → write plan first, get confirmation, then build
- **VERIFY-BEFORE-DONE:** never close a task without proving it works (build, test, diff)
- **MINIMAL-CORRECT-CHANGE:** touch only scope files, fix root cause, simple > abstract
- **COMPOUND-ENGINEERING:** CEO corrects you → update `docs/` so it never repeats
- **BACKLOG-FIRST:** found work outside current task → log to MC, don't start it
- **SOCRATIC-GATE:** new feature/migration → stop, ask 2-3 questions before code
- **SKILL-ADVISOR:** at task start, check `docs/operations/skill-advisor.md` and proactively offer the fitting skill/command/MCP (don't hand-roll what a tool does better) → `operational-rules.md` § RULE-SKILL-ADVISOR. A `UserPromptSubmit` hook injects 💡 hints automatically.

## Rules (enforced)
- **Design System:** the brand DS lives in the **shishka-health repo** (`design-system/index.html` living guide + `design-system/MASTER.md` rules) — built from the live site's real tokens (royal-green `#1E3903`, spice-red CTA, gold prices, SF Pro/Albert Sans). Before ANY front-end work, check it; reuse `.shk-*` primitives, reference semantic tokens not raw hex. The admin panel is being migrated to this brand — don't treat the old default-Tailwind `/menu` styling as canon. Full rule: `docs/constitution/technical-rules.md` § RULE-DESIGN-SYSTEM
- **Deploy Map:** `shishka.health` = Vercel `shishka-web` ← repo `shishka-health` (git-only; `shishka-os` Vercel project = admin panel). Agents NEVER `vercel deploy`. Topology + prod-incident runbook: `docs/operations/deploy-map.md`; rule: `technical-rules.md` § RULE-DEPLOY-MAP
- **Commit Gate:** never push until MC task updated + docs synced — `technical-rules.md` § RULE-COMMIT-GATE
- **Git:** branches `feature/{project}/description`, never commit to `main`
- **Task lifecycle:** `.claude/skills/task-lifecycle/SKILL.md`
- **STATUS.md** is auto-generated — never edit manually
