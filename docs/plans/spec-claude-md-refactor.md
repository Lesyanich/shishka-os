# Spec: CLAUDE.md Refactor — Thin Router + Boris Principles

> MC Task: TBD (will create after CEO approval)
> Status: DRAFT v2 — awaiting CEO review
> Author: COO
> Date: 2026-04-09

## Problem

Current `CLAUDE.md` is ~110 lines (~2200 tokens) loaded into **every** session. Most of that weight is dispatcher routing tables and project detection logic — useful only when determining which agent to load (~30% of sessions). The remaining 70% of sessions pay the full token tax for context they don't need.

Additionally, the multi-agent routing architecture (5 agents, signal tables, auto-routing keywords) is over-engineered for the current stage. Claude can infer domain from the task itself — it doesn't need a keyword table to know "чек от Makro" is finance. The routing tables cost ~800 tokens and duplicate what the model already understands.

Boris Cherny's (author of Claude Code) personal CLAUDE.md demonstrates the opposite approach: ~50 lines of behavioral principles, zero routing tables. One agent, thin context, subagents for research. The model is designed to work well with minimal instructions.

## Goal

1. Reduce CLAUDE.md to **~40 lines** of identity + principles + pointers
2. Move heavy routing logic into on-demand files (loaded only when needed)
3. Add **5 new behavioral rules** from Boris Cherny's patterns and gap analysis
4. Simplify agent routing: trust the model more, prescribe less
5. Eliminate token waste on context that's rarely needed

**Expected savings:** ~1500 tokens per session × ~20 sessions/day = ~30,000 tokens/day.

## Design

### New CLAUDE.md Structure (~40 lines)

```markdown
# CLAUDE.md — Shishka OS v6.0

## Identity
Shishka Healthy Kitchen ERP. Multiple projects, one Supabase backend.

## Language Contract
- Conversation: human's language (CEO → Russian, partner → their language)
- Storage (DB, MC, code, commits, specs): English only, no exceptions
- Full rule: docs/constitution/core-rules.md § RULE-LANGUAGE-CONTRACT

## Session Start (MANDATORY)
1. Read docs/constitution/core-rules.md
2. Pick up task: list_tasks(status="in_progress") → if empty → inbox
3. Load task context: get_task(id) → read spec_file + context_files
4. If task has context_files → load ONLY those + core-rules.md. Skip everything else.
5. If no context_files → read docs/constitution/context-routing.md for L1/L2/LK

## Agent Routing
If user sends /chef, /finance, /strategy, /techlead → read docs/constitution/agent-routing.md
If user sends free text → infer domain from content, load the matching AGENT.md.
When unsure → ask: "This sounds like [domain]. Should I load [agent]?"

## Core Principles
- PLAN-BEFORE-BUILD: 3+ steps → write plan first, get confirmation
- VERIFY-BEFORE-DONE: never close a task without proving it works (build, test, diff)
- MINIMAL-CORRECT-CHANGE: touch only what's in scope, fix root cause not symptoms, simple > abstract
- COMPOUND-ENGINEERING: CEO corrects you → update docs/ so it never repeats
- BACKLOG-FIRST: found work outside current task → log to MC, don't start it
- SOCRATIC-GATE: new feature/migration → stop, ask 2-3 questions before code

## Rules (enforced)
- Commit Gate: never push until MC task + CURRENT.md updated
- Git: branches feature/{project}/description, never commit to main
- Task lifecycle: .claude/skills/task-lifecycle/SKILL.md
- STATUS.md is auto-generated — never edit manually
```

### Comparison: Current vs New

| Metric | Current CLAUDE.md | New CLAUDE.md |
|--------|-------------------|---------------|
| Lines | ~110 | ~40 |
| Tokens (est.) | ~2200 | ~700 |
| Routing tables | 3 (slash commands, auto-routing, project detection) | 0 (moved to on-demand files) |
| Dead Zones | inline | moved to context-routing.md |
| Behavioral principles | 3 (compound, backlog, socratic) | 6 (+plan, +verify, +minimal) |
| Agent routing | prescriptive keyword table | trust model + fallback to file |

---

## Files to Create

### 1. `docs/constitution/context-routing.md` (NEW)

Absorbs from current CLAUDE.md:

- Project Detection table (signal → project mapping)
- L1: Project Context table (project → CURRENT.md + frontend-rules)
- L2: Module Context (modules list, spec locations)
- LK: Knowledge Base routing (bible, domain, business)
- L3: On-demand references (DB schema, architecture, keys)
- Dead Zones table

**When loaded:** ONLY when a task lacks `context_files` — the fallback path. Tasks with `context_files` never see this file.

### 2. `docs/constitution/agent-routing.md` (NEW)

Absorbs from current CLAUDE.md:

- Slash commands table (/chef, /finance, /coo, /strategy, /techlead)
- Agent → AGENT.md + MCP tools + domain mapping
- COO split note (auto-router to /strategy or /techlead)
- "After routing" protocol

**What's removed:** the auto-routing keyword signal table. Claude can infer "receipt" → finance and "BOM" → kitchen without a lookup table. If the model is uncertain, it asks — which is better than a stale keyword list that can't cover every case.

**When loaded:** ONLY when user sends a slash command or agent can't determine role from task context.

---

## New Rules

### 3. RULE-PLAN-BEFORE-BUILD → `core-rules.md`

```markdown
## RULE-PLAN-BEFORE-BUILD

For any task requiring 3 or more steps, or involving architectural decisions:
1. Write a plan FIRST (in MC comment, spec file, or session-log)
2. Get confirmation from CEO (or COO for autonomous lane tasks)
3. Only then begin implementation

If something goes wrong mid-execution → STOP and re-plan immediately.
Do not push through a broken approach hoping it will work out.

Simple, obvious fixes (typo, one-line change, config update) are exempt.

> Origin: 2026-04-09. Inspired by Boris Cherny's "Plan Mode Default" pattern.
> Complements RULE-SOCRATIC-GATE (which covers new features/migrations specifically).
> This rule covers the general case: any non-trivial work.
```

### 4. RULE-VERIFY-BEFORE-DONE → `agent-rules.md`

```markdown
## RULE-VERIFY-BEFORE-DONE

Never mark a task as `done` in MC without proving it works. Proof means:

**Mandatory for all code tasks:**
- Build passes
- Lint passes

**At least one of (depending on task type):**
- Tests pass (if tests exist for the touched area)
- UI verified (screenshot or manual check for frontend changes)
- Diff reviewed: `git diff main...HEAD` shows only intended changes, no accidental side effects
- grep/assertion confirms the change (for data fixes, config changes)

**Elegance pause (non-trivial changes only):**
Before marking done, ask: "Is there a simpler way to achieve this?" If the fix feels hacky — 
rethink. Skip this for obvious one-line fixes.

Heuristic: "Would a senior engineer approve this PR?" If not → not done.

> Origin: 2026-04-09. Inspired by Boris Cherny's "Verification Before Done" + "Demand Elegance" patterns.
> Codifies what task-lifecycle implies but doesn't enforce as a named rule.
> The elegance pause absorbs Boris's "Demand Elegance (Balanced)" — not a separate rule,
> but a step in verification. Deferred to post-opening if it slows velocity.
```

### 5. RULE-MINIMAL-CORRECT-CHANGE → `engineering-rules.md`

```markdown
## RULE-MINIMAL-CORRECT-CHANGE

Every code change must be:

1. **Minimal** — touch only files listed in the task scope (or handoff packet `Scope — files`).
   If you need to change a file not in scope, STOP: either expand scope via MC comment
   or log a separate task (RULE-BACKLOG-FIRST).

2. **Root-cause** — fix the cause, not the symptom. No `// TODO: fix later` hacks,
   no `try/catch` that swallows errors to make tests pass, no hardcoded values
   that paper over a broken query. If the root cause is too deep for this task,
   log a new task with the real fix and document the temporary workaround explicitly.

3. **Simple** — if there's a direct solution and an abstract one, choose direct.
   Create an abstraction only when the same pattern appears 3+ times.
   "Might need it later" is not a reason to abstract now.

> Origin: 2026-04-09. Inspired by Boris Cherny's "Simplicity First", "No Laziness",
> and "Minimal Impact" principles. Addresses observed pattern where agents over-engineer
> solutions, touch files outside scope, or apply temporary fixes that become permanent.
```

### 6. RULE-SUBAGENT-HYGIENE → `agent-rules.md`

```markdown
## RULE-SUBAGENT-HYGIENE

When working in Claude Code (not Cowork), use subagents to keep the main context window clean:

**Offload to subagent:**
- Research: grep across codebase, read multiple files to understand a pattern
- Exploration: "how does module X work?", "find all usages of Y"
- Parallel analysis: checking multiple files for the same pattern
- Verification: running tests, checking build output, reviewing diffs

**Keep in main context:**
- Simple single-file edits
- Quick lookups (one grep, one file read)
- MC operations (emit_task, update_task, add_comment)
- The actual implementation work

**One task per subagent.** Don't ask a subagent to "research and then fix" — 
research in one subagent, implement in main context.

> Origin: 2026-04-09. Inspired by Boris Cherny's "Subagent Strategy" pattern.
> Context window pollution was observed in long Claude Code sessions where
> research + implementation in the same thread degraded output quality.
```

### 7. Lightweight Agent Routing (replaces keyword tables)

The current auto-routing table in CLAUDE.md has 6 rows of keyword→domain mappings. This is replaced by a principle in the new CLAUDE.md:

```
If user sends free text → infer domain from content, load the matching AGENT.md.
When unsure → ask: "This sounds like [domain]. Should I load [agent]?"
```

**Why this works:** Claude already understands that "чек от Makro" is finance and "новый салат с киноа" is kitchen. A keyword table can't cover every case (what about "supplier contract terms"? — it's both procurement and finance). The model's inference is more flexible than a static lookup.

**Safety net:** `agent-routing.md` still exists with the full mapping for slash commands and edge cases. It's just not loaded by default.

---

## Migration Plan

### Phase 1: Create new files (no breaking changes)
1. Create `docs/constitution/context-routing.md` — extract from CLAUDE.md sections: Project Detection, L1, L2, LK, L3, Dead Zones
2. Create `docs/constitution/agent-routing.md` — extract from CLAUDE.md sections: Dispatcher tables, COO split note
3. Add RULE-PLAN-BEFORE-BUILD to `core-rules.md`
4. Add RULE-VERIFY-BEFORE-DONE to `agent-rules.md`
5. Add RULE-SUBAGENT-HYGIENE to `agent-rules.md`
6. Add RULE-MINIMAL-CORRECT-CHANGE to `engineering-rules.md`

### Phase 2: Replace CLAUDE.md
7. Replace CLAUDE.md with the thin version (~40 lines)
8. grep all `.md` files for references to old CLAUDE.md sections ("see CLAUDE.md § Dead Zones", etc.) and update pointers

### Phase 3: Verify
9. Test: `/chef` in Claude Code → verify agent-routing.md is found and AGENT.md loads
10. Test: task WITH `context_files` → verify routing files are NOT loaded (token savings)
11. Test: task WITHOUT `context_files` → verify context-routing.md fallback works
12. Test: free text "у меня чек от Makro" → verify model infers finance without keyword table
13. Compare token usage: run 3 sessions before/after refactor, measure context size

---

## What We Are NOT Doing

- NOT removing any existing rules or protocols
- NOT touching AGENT.md files (they remain the domain-specific context)
- NOT changing Mission Control schema or MCP tools
- NOT adopting Boris's `tasks/todo.md` or `tasks/lessons.md` (MC + COMPOUND-ENGINEERING is superior)
- NOT adopting "Autonomous Bug Fixing" (conflicts with RULE-BACKLOG-FIRST in multi-agent setup — one agent must not fix bugs in another's domain without routing)
- NOT merging agents into one (the /chef, /finance UX shortcuts are valuable for CEO)

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Agent skips `agent-routing.md` and doesn't know its role | Medium | Explicit pointer in CLAUDE.md Session Start; AGENT.md paths are predictable (`agents/{name}/AGENT.md`) |
| Hardcoded refs to old CLAUDE.md sections break | Low | Phase 2 step 8: grep + update all references |
| Model infers wrong domain from free text | Low | "When unsure → ask" fallback; agent-routing.md still available |
| New rules slow down velocity | Low | All new rules have "simple fix exempt" clauses; VERIFY elegance pause deferred if it blocks opening |

## Decision Needed from CEO

1. Approve the thin CLAUDE.md structure (~40 lines, ~700 tokens)?
2. Approve all 5 new rules (PLAN-BEFORE-BUILD, VERIFY-BEFORE-DONE, MINIMAL-CORRECT-CHANGE, SUBAGENT-HYGIENE, lightweight routing)?
3. Approve removing auto-routing keyword table in favor of model inference?
4. Priority: execute now (kind:docs, low risk, ~2 hours) or backlog?
