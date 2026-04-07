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

**Agent loading behavior:** call `get_task(id)` → if `context_files` is non-empty, load **only** those files + `core-rules.md`. Skip the CLAUDE.md L2 module scan entirely. If `context_files` is empty, fall back to L2 routing.

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

## Integration with Backlog First

`RULE-BACKLOG-FIRST` (in `core-rules.md`) tells you what to do when you discover work outside the current task. The two rules compose:
- Discover B → log to MC (Tier 1, `inbox`) → ask CEO whether to continue A or switch
- Don't silently start B
- Don't silently drop B

---

## Session End Protocol

At session end:
1. All Tier 1 work is already in MC (no batch flush — emit live)
2. `session-log.md` reflects every step taken
3. If using a worktree → see `engineering-rules.md` → `RULE-WORKTREE-DISCIPLINE`
4. If COO → add a comment to the **COO Running Log** task (see `spec-coo-v2.md`)

No "session summary" task. No batch end-of-session writes. Live tracking only.
