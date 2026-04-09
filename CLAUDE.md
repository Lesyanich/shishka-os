# CLAUDE.md — Shishka OS v6.0

## Identity
Shishka Healthy Kitchen ERP. Multiple projects, one Supabase backend.

## Language Contract
- Conversation: human's language (CEO → Russian, partner → their language)
- Storage (DB, MC, code, commits, specs): English only, no exceptions
- Full rule: `docs/constitution/core-rules.md` § RULE-LANGUAGE-CONTRACT

## Session Start (MANDATORY)
1. Read `docs/constitution/core-rules.md`
2. Pick up task: `list_tasks(status="in_progress")` → if empty → `list_tasks(status="inbox")`
3. Load task context: `get_task(id)` → read `spec_file` + `context_files`
4. If task has `context_files` → load ONLY those + `core-rules.md`. Skip everything else.
5. If no `context_files` → read `docs/constitution/context-routing.md` for L1/L2/LK
6. For code/DB tasks, also load `docs/constitution/engineering-rules.md`
7. For agent behavior questions, load `docs/constitution/agent-rules.md`

## Agent Routing
If user sends `/chef`, `/finance`, `/strategy`, `/techlead` → read `docs/constitution/agent-routing.md`
If user sends free text → infer domain from content, load the matching `agents/{name}/AGENT.md`.
When unsure → ask: "This sounds like [domain]. Should I load [agent]?"

## Core Principles
- **PLAN-BEFORE-BUILD:** 3+ steps → write plan first, get confirmation, then build
- **VERIFY-BEFORE-DONE:** never close a task without proving it works (build, test, diff)
- **MINIMAL-CORRECT-CHANGE:** touch only scope files, fix root cause, simple > abstract
- **COMPOUND-ENGINEERING:** CEO corrects you → update `docs/` so it never repeats
- **BACKLOG-FIRST:** found work outside current task → log to MC, don't start it
- **SOCRATIC-GATE:** new feature/migration → stop, ask 2-3 questions before code

## Rules (enforced)
- **Commit Gate:** never push until MC task + CURRENT.md updated
- **Git:** branches `feature/{project}/description`, never commit to `main`
- **Task lifecycle:** `.claude/skills/task-lifecycle/SKILL.md`
- **STATUS.md** is auto-generated — never edit manually
