# Agent Rules — Behavior Protocol

> Priority: Core Rules > Engineering Rules > **Agent Rules (this file)** > Module rules > Task context
>
> Replaces legacy `agent-tracking.md`. All references to "Boris Rule #13/14/15/17" map to the semantic IDs below.
>
> Every agent **must** read this file before starting any work session.

---

## Two-Tier Tracking

The system has two parallel tracking layers. Pick the right one or work disappears.

### Tier 1 — Mission Control (`business_tasks` table)

**Visible to the CEO in the MC Kanban UI.**

Write to MC when **all three** are true:
1. The work has a **business outcome the CEO would recognize** (not a code change)
2. It is a **completed unit of work**, not a mid-step
3. It took **non-trivial effort** (multiple tool calls or meaningful discovery)

#### Field conventions

| Field | Rule |
|---|---|
| `source` | `agent_discovery` (agents discover work, they don't receive orders) |
| `created_by` | `{name}-agent` (e.g. `finance-agent`, `chef-agent`, `coo`) |
| `status` | `inbox` (default — CEO triages) or `done` (if already completed) |
| `assigned_to` | `null` — agents never assign work to humans |
| `priority` | per `DISPATCH_RULES.md` |
| `related_ids` | must include at least one entity ID (snake_case keys, primitive values only) |
| **Title** | **English only** (RULE-LANGUAGE-CONTRACT) |

#### Tier 1 examples

- Finance: "Parsed 5 receipts from inbox (12,340 THB)"
- Finance: "Possible duplicate supplier: Makro Samui vs SIAM MAKRO"
- Chef: "New dish created: SALE-PUMPKIN-SOUP (margin 68%)"
- Chef: "BOM cost alert: RAW-SALMON +15% vs last month"
- COO: "Triaged 12 inbox items, 3 escalated to critical"

### Tier 2 — Session Log (local markdown)

**NOT visible in MC. The agent's internal worklog.**

Location: `agents/{name}/session-log.md`

What goes here:
- Technical sub-steps (wrote SQL, fixed TS error, updated component)
- Read-only operations (searched nomenclature, checked inventory)
- Failed attempts that were retried
- Internal reasoning, validation, arithmetic checks
- Tool call details and intermediate results

Format:
```markdown
## 2026-04-02 14:30 — Receipt Processing
- [14:30] check_inbox → 3 pending receipts
- [14:31] update_inbox(id: abc) → status: processing
- [14:35] search_nomenclature x12 → 10 matched, 2 new RAW-AUTO
- [14:36] **→ TIER 1**: Created task "Parsed receipt: Makro 2,340 THB (12 items)"
```

Rules:
1. Each session: `## date time — title` header
2. Each step: one line, `[time] action → result`
3. When a Tier 1 task is emitted, prefix with `**→ TIER 1**`
4. Append-only. Never edit previous sessions
5. Rotate after 200 lines → `agents/{name}/session-log-archive.md`
6. No summarization — raw append only

> Origin: Foundational. Without two-tier separation, MC fills with noise and the CEO loses signal.

---

## RULE-TASK-CLOSURE

When an agent completes a task from MC, the cycle is **not done** until the full chain runs:

```
work → build → commit → PR → merge → update_task(status="done", notes="...") → report to CEO
```

The `update_task` step is **mandatory**. A merged PR with a stale MC task is a tracking failure, full stop.

Task `notes` must include:
- What was done (one line)
- PR number (if a PR exists)
- Any follow-up needed (if any)

When nominating a **next task** in the closing comment (e.g. "unblocks X", "next in thread is Y"), the nomination is itself a handoff — it must respect `RULE-HANDOFF-PACKET`. A bare "next: <task-id>" is fine; any scope, acceptance, or FORBIDDEN content requires a full packet in the target task, not in the closure comment.

> Origin: 2026-04-04. Task `f2d26205` was left `in_progress` after the PR was merged. CEO discovered the drift days later. (Legacy: `Boris Rule #13`.)

---

## RULE-SPEC-MC-BINDING

Every spec file in `docs/plans/spec-*.md` (or `docs/projects/{project}/plans/spec-*.md`) **must** be linked to a Mission Control task.

When creating a spec:
1. Create the MC task **first** (or find an existing one)
2. Put the task ID in the spec header: `> MC Task: {full-uuid}`
3. Put the spec path in the task's `spec_file` field via `update_task`

A spec with `MC Task: TBD` is a violation. No TBD — create the task immediately, even if it's a one-liner you'll flesh out later.

> Origin: 2026-04-04. `spec-gdrive-receipt-archive.md` was created without an MC task and was lost in the queue. (Legacy: `Boris Rule #14`.)

---

## RULE-SPEC-PROMOTION

Architectural decisions, multi-step plans, and design specs **must** live in `docs/plans/spec-*.md` (or `docs/projects/{project}/plans/spec-*.md`), not inlined as MC task comments.

Inlining a spec as a comment on an MC task is an **emergency fallback only** — valid when tooling is temporarily broken (e.g. `emit_business_task` rejects a payload, RPC is down, MCP server is unreachable) and losing the context is worse than breaking the rule.

When you fall back to an inlined spec:

1. **Immediately add a `TODO: promote to docs/plans/spec-*.md` marker** at the top of the comment
2. **Flag it in the Running Log session-end comment** as "inlined spec, discoverability degraded"
3. **Promote to a real `docs/plans/spec-*.md` file within the same session** (not "next session" — fatigue kills follow-through)
4. **Once promoted, amend the inlined comment** with a link to the real spec file and the note "SUPERSEDED by docs/plans/spec-X.md — kept for provenance only"

A 6-comment inlined spec split across session 5 that survives into session 6 is a violation. Spec content trapped in MC comments is effectively invisible to the session-start protocol (which reads only the last 20 comments of Running Log) and cannot be referenced by RULE-SPEC-MC-BINDING.

**Handoff packets count as specs.** When COO (or any agent) routes work to another agent, the handoff is a spec in miniature — it has scope, acceptance criteria, FORBIDDEN list, commit message, branch decision. Size is NOT a distinguishing criterion. A 5-line handoff is still addressable work that belongs in an MC task, not in chat. The receiving agent reads MC on session-start, not chat history — anything pasted in chat is invisible to them.

**Pre-send heuristic:** if a message to CEO contains a markdown heading (`##`) or a code block (``` ``` ```) with work instructions, it is a spec. Put it in an MC task comment. Return to CEO only the task ID + optionally ≤1 sentence of social context ("why this task now").

**Valid in chat:** task IDs, single-sentence context, status reports, questions needing CEO judgment.
**Not valid in chat:** scope lists, acceptance criteria, commit messages, FORBIDDEN lists, file lists, multi-section packets.

**Committed-to-main precondition.** A handoff packet that references a spec file **must** verify the spec is committed to `main` before routing. An orphan-spec handoff (packet points to an uncommitted file on a feature branch) forces the receiving agent to guess scope or block on a dependency that isn't visible in `main`. Verify with `git log --oneline main -- <spec-path>` before pasting the packet.

> Origin: 2026-04-08. Session 5 architected a three-layer brain (LightRAG/MemPalace/Graphify) with full storage posture and phase plans — all trapped in 6 MC comments because `emit_business_task` was blocked by `3cc98121`. Session 6 COO session-start read only the last 5 comments and reported the architecture as non-existent. CEO caught the regression. Promoted to specs as `docs/plans/spec-shishka-brain.md`, `spec-mempalace-phase2.md`, `spec-graphify-phase3.md`.
>
> Origin 2 (expansion): 2026-04-08 Session 6. Same session that authored the original rule inlined a 100-line handoff packet in chat within 10 minutes, then had to own a regression. Rule expanded to close the size-based loophole. See `memory/feedback_coo_handoff_short.md`. Companion rule `RULE-HANDOFF-PACKET` codifies the required shape.

---

## RULE-HANDOFF-PACKET

Every routing comment from one agent to another (most commonly COO → Code, but also Code → Finance, Finance → COO, etc.) on a task with `executor_type = "code"` (or any executing agent) **must** be posted as an MC task comment and **must** carry all of the following fields. Missing fields = incomplete packet = receiving agent is allowed to reject and request a rewrite.

### Required fields

| Field | What it contains | Why |
|---|---|---|
| **Lane** | `coo-autonomous` (whitelisted kind) or `ceo-gated` | Tells receiver whether direct-to-main is permitted |
| **Scope — files** | Exact list of files to touch, annotated `(new)` / `(modified)` / `(delete)` | Prevents scope creep and `git add .` accidents |
| **Scope — excluded** | Dirty files in the tree that MUST NOT be touched, with reason | Prevents accidental bundling with unrelated work |
| **Commit/PR plan** | One commit vs many? Branch name? Direct push vs PR? | Merge strategy, not an afterthought |
| **Commit message template** | Full message in a code block, ready to paste | Removes receiver-side phrasing variance |
| **Steps** | Ordered 1…N action list (git add per-file, commit, push, MC update) | Eliminates ambiguity in execution order |
| **Skills to load** | Exact skill IDs (e.g. `task-lifecycle`, `superpowers:verification-before-completion`) | Receiver doesn't guess which skill applies |
| **Acceptance criteria** | Verifiable checks (grep commands, file counts, git log assertions) | Defines "done" with no interpretation |
| **FORBIDDEN** | Explicit list of actions the receiver MUST NOT take | Closes loopholes before they open |
| **Blocks / blocked-by** | MC task IDs the work depends on or unblocks | Dependency chain is visible to CEO |

### When it applies

- Every COO routing comment on a `code` executor_type task
- Every cross-agent handoff (Chef → Code, Finance → Code, Code → Chef, etc.)
- Every "next task in this thread" nomination (the nomination is a mini-packet)

### When it does NOT apply

- Status updates on an already-scoped task
- Questions or clarifications between agents
- Closing comments (SHA + summary, not new scope)

### Rejection protocol

If the receiving agent sees a packet missing required fields:
1. Do **not** start work
2. Post a comment: `RULE-HANDOFF-PACKET violation — missing: <field1>, <field2>. Rewrite required.`
3. Leave task status unchanged (do not mark `in_progress`)
4. Surface in next report to CEO

### Reference implementation

The routing comment on MC task `d096698b` (Session 6, 2026-04-08) is the canonical shape. Read it when in doubt. It contains every required field and is the template this rule codifies.

> Origin: 2026-04-08 Session 6. COO routing drifted into prose twice in one session, /code lost exact scope both times. Named rule introduced so violations can be cited directly (`нарушает RULE-HANDOFF-PACKET, поле X отсутствует`) instead of hand-waving at "the handoff was unclear".

---

## RULE-MCP-IDENTITY

Each MCP server owns a specific domain. Use the right server for the right job.

| MCP Server | Domain | Sample tools |
|---|---|---|
| `shishka-mission-control` | Tasks, sprints, comments | `emit_business_task`, `list_tasks`, `get_task`, `update_task`, `add_comment`, `create_sprint` |
| `shishka-finance` | Receipts, expenses, suppliers | `approve_receipt`, `check_inbox`, `search_expenses`, `manage_suppliers` |
| `shishka-chef` | Kitchen, BOM, recipes, products | `create_product`, `add_bom_line`, `validate_bom`, `calculate_cost`, `search_knowledge` |

**Never** use `shishka-chef` for MC operations or `shishka-finance` for chef tasks. If the correct MCP is not connected, **report to the CEO** — do not "approximate" with a wrong one.

> Origin: Foundational. (Legacy: `Boris Rule #15`.)

---

## RULE-SCOPED-CONTEXT

Every MC task intended for a code agent **must** have `context_files` filled before the task moves to `in_progress`.

When creating or triaging a task:
1. Identify the 2–5 files an agent needs to complete the task (spec, domain doc, AGENT.md)
2. Set `context_files` via `update_task` — array of repo-relative paths
3. Use project-specific spec paths: `docs/projects/{project}/plans/spec-*.md` when applicable
4. Always include `docs/constitution/core-rules.md` for tasks touching DB or architecture

Example:
```json
[
  "docs/plans/spec-receipt-model-selector.md",
  "agents/finance/AGENT.md",
  "docs/domain/financial-codes.md",
  "docs/constitution/core-rules.md"
]
```

**Agent loading behavior:** call `get_task(id)` → if `context_files` is non-empty, load **only** those files + `core-rules.md`. Skip context routing entirely. If `context_files` is empty, fall back to `docs/constitution/context-routing.md` for L1/L2 routing.

> Origin: AI-Native Ops Phase C. Token budgets exploded when agents loaded entire CLAUDE.md routing on every task. (Legacy: `Boris Rule #17`.)

---

## RULE-IDEA-CAPTURE (COO-specific)

When the CEO sends a free-form message to the COO that looks like an idea, request, or observation — the COO **must** capture it before discussing it.

Sequence:
1. Receive CEO message
2. Classify (idea / question / decision / pure conversation)
3. If idea or request → `emit_business_task` immediately with `status: inbox`, English title, `created_by: coo`, `tags: ["from:ceo"]`
4. **Then** discuss with the CEO

The capture happens **before** the discussion, not after. Otherwise ideas get lost in the conversation buffer.

Pure conversation ("how are you", "what do you think of X") is exempt — but when in doubt, capture.

> Origin: 2026-04-07. CEO observed that ideas thrown into the COO get lost mid-conversation. (See `spec-coo-v2.md` for the full COO design.)

---

## RULE-AUTONOMOUS-LANE

The COO may route **low-risk, reversible** tasks directly to Code without CEO mediation by tagging them `coo-autonomous`. Code picks these up in session-start, runs the full lifecycle, and reports on the next morning loop. Full design: `docs/plans/spec-coo-autonomous-lane.md`.

### Whitelist — kinds eligible for autonomous execution

- `kind:docs`
- `kind:cleanup`
- `kind:refactor`
- `kind:bug-fix`
- `kind:data-fix`

### Blacklist — kinds that MUST NOT carry `coo-autonomous` (hard constraint)

- `kind:security`, `kind:rls` — prod blast radius
- `kind:meta` — protocol/constitution/dispatch changes; CEO is the principal
- `kind:install`, `kind:install-prod` — physical/production setup, not reversible
- `kind:rpc-backend` — schema/RPC changes hit every agent
- `kind:feature` — all feature work gated until a later protocol revision

If COO tags a blacklisted kind with `coo-autonomous`, Code **refuses and escalates**: strip the tag, post a rejection comment, leave the task in `inbox`. Do not silently proceed.

### Code session-start ordering

```
1. list_tasks(status="in_progress")                        # continuity (unchanged)
2. list_tasks(status="inbox", tag="coo-autonomous")        # NEW: autonomous queue
3. list_tasks(status="inbox", priority="critical")         # normal fallback
```

If a `coo-autonomous-paused` task exists at project level (kill switch), Code skips step 2 and jumps to the critical fallback.

### Gate-first inside the autonomous lane

Autonomous ≠ careless. Inside the lane Code still:
- runs build/lint/tests before claiming completion (`RULE-TASK-CLOSURE`)
- investigates unexpected state before destructive action
- escalates (status `blocked` + comment) if the task turns out to need a blacklisted action

Escalation does **not** fall through to silent CEO-gated processing — the task is left `in_progress` or `blocked` with an explicit comment, so it surfaces in the CEO's morning/evening review.

### CEO opt-out

- Strip `coo-autonomous` tag from any inbox task → pulls it back to the gated lane
- Use the kill switch `coo-autonomous-paused` (project-level tag) → disables the lane entirely for all new work

> Origin: 2026-04-08. CEO: «я хочу чтобы некоторые задачи, которые не требуют моего апрува COO и код передавали друг другу». (MC task `201267d0`.)

---

## Integration with Backlog First

`RULE-BACKLOG-FIRST` (in `core-rules.md`) tells you what to do when you discover work outside the current task. The two rules compose:
- Discover B → log to MC (Tier 1, `inbox`) → ask CEO whether to continue A or switch
- Don't silently start B
- Don't silently drop B

---

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
Before marking done, ask: "Is there a simpler way to achieve this?" If the fix feels hacky — rethink. Skip this for obvious one-line fixes.

Heuristic: "Would a senior engineer approve this PR?" If not → not done.

> Origin: 2026-04-09. Inspired by Boris Cherny's "Verification Before Done" + "Demand Elegance" patterns. Codifies what task-lifecycle implies but doesn't enforce as a named rule. The elegance pause absorbs Boris's "Demand Elegance (Balanced)" — not a separate rule, but a step in verification.

---

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

**One task per subagent.** Don't ask a subagent to "research and then fix" — research in one subagent, implement in main context.

> Origin: 2026-04-09. Inspired by Boris Cherny's "Subagent Strategy" pattern. Context window pollution was observed in long Claude Code sessions where research + implementation in the same thread degraded output quality.

---

## Session End Protocol

At session end:
1. All Tier 1 work is already in MC (no batch flush — emit live)
2. `session-log.md` reflects every step taken
3. If using a worktree → see `engineering-rules.md` → `RULE-WORKTREE-DISCIPLINE`
4. If COO → add a comment to the **COO Running Log** task (see `spec-coo-v2.md`)

No "session summary" task. No batch end-of-session writes. Live tracking only.
