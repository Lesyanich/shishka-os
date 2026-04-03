# Agent Tracking Protocol — Two-Tier System

> Every agent MUST read this file before starting any work session.
> This protocol defines what goes to Supabase (visible in Mission Control)
> and what stays in local markdown files.

## Tier 1: Business Tasks (Supabase `business_tasks`)

**Visible to Lesia in Mission Control UI (Kanban board).**

Write to `business_tasks` when ALL conditions are met:
1. The work has a **business outcome Lesia would recognize** (not a code change)
2. The result is a **completed unit of work** (not a mid-step)
3. It took **non-trivial effort** (multiple tool calls or meaningful discovery)

### Decision Tree

```
Произведён бизнес-результат?
  НЕТ → Tier 2 (local log)
  ДА → Это завершённая единица работы (не промежуточный шаг)?
    НЕТ → Tier 2 (local log)
    ДА → Пишем в business_tasks (Tier 1)
```

### Field Conventions

| Field | Rule |
|-------|------|
| `source` | `agent_discovery` (agents discover work, they don't receive orders) |
| `created_by` | `{name}-agent` (e.g. `finance-agent`, `chef-agent`, `dispatcher`) |
| `status` | `inbox` (default — Lesia triages) or `done` (if work already completed) |
| `assigned_to` | `null` (agents NEVER assign work to humans) |
| `priority` | Follow DISPATCH_RULES.md priority algorithm |
| `related_ids` | MUST include at least one entity ID (see schema below) |

### `related_ids` JSON Convention

```json
{
  "inbox_id": "uuid",
  "nomenclature_id": "uuid",
  "expense_id": "uuid",
  "agent_session": "2026-04-02T14:30:00",
  "batch_count": 5,
  "batch_total_thb": 12340.50,
  "git_branch": "feature/admin/fix-bom",
  "pr_number": 42
}
```

Rules:
- Keys use `snake_case`
- Values are primitives (string, number, boolean) — no nested objects
- `agent_session` is the ISO timestamp of the session header in session-log.md
- Unknown keys are allowed but the keys above are the standard set

### Tier 1 Examples (WRITE to DB)

**Finance Agent:**
- "Parsed 5 receipts from inbox (12,340 THB)" — batch job completed
- "Blocked: receipt #abc123 has unreadable items" — needs human decision
- "Possible duplicate supplier: Makro Samui vs SIAM MAKRO" — discovery

**Chef Agent:**
- "New dish created: SALE-PUMPKIN-SOUP (margin 68%)" — new entity
- "Audited 23 SALE items — 4 issues found" — audit completed
- "BOM cost alert: RAW-SALMON price +15% vs last month" — discovery

**Dispatcher:**
- "Created 3 tasks for initiative 'Autumn Menu Launch'" — routing completed

---

## Tier 2: Session Log (Local Markdown)

**NOT visible in Mission Control. Agent's internal worklog.**

Location: `agents/{name}/session-log.md`

### What Goes Here

- Technical sub-steps: wrote SQL, fixed TS error, updated component
- Read-only operations: searched nomenclature, checked inventory levels
- Failed attempts that were retried successfully
- Internal reasoning, validation, arithmetic checks
- Tool call details and intermediate results

### Format

```markdown
## 2026-04-02 14:30 — Receipt Processing

- [14:30] check_inbox → 3 pending receipts
- [14:31] update_inbox(id: abc) → status: processing
- [14:32] read photo → identified as Makro receipt
- [14:33] read_guideline("makro") → loaded
- [14:34] parsed 12 line items, arithmetic OK
- [14:35] search_nomenclature x12 → 10 matched, 2 new RAW-AUTO
- [14:36] update_inbox → status: parsed
- [14:36] **→ TIER 1**: Created task "Parsed receipt: Makro 2,340 THB (12 items)"

---
```

### Rules

1. Each session gets a `## date time — title` header
2. Each step is one line: `[time] action → result`
3. When a Tier 1 task is emitted, mark with `**→ TIER 1**` prefix
4. Append-only. Never edit previous sessions.
5. Rotate after 200 lines: move old content to `agents/{name}/session-log-archive.md`
6. Do NOT spend tokens summarizing — raw append only

### Tier 2 Examples (local log ONLY, NOT in DB)

- "wrote SQL migration for new index"
- "fixed TypeScript compilation error"
- "searched nomenclature for RAW-CARROT — found"
- "retried OCR on blurry image — success on 2nd attempt"
- "calculated nutrition for 3 ingredients"
- "read guideline for Makro receipt format"

---

## Integration with Existing Systems

### Backlog First Protocol (p0-rules.md)
The Backlog First Protocol remains in effect. If an agent discovers functionality B while working on task A:
- If B is a **business task** → write to `business_tasks` with `source: agent_discovery`, `status: inbox`
- If B is a **technical debt** → log in `docs/tech-debt.md` as before
- In both cases: report to user and wait for confirmation before switching tasks

### Dispatch Rules (DISPATCH_RULES.md)
Agent-created tasks follow the same domain taxonomy and priority algorithm.
The Dispatcher agent uses `emit_business_task` as its primary tool.
Other agents use it as a side-effect of their main workflow.

### Session End
At session end, the agent's session-log.md should reflect all work done.
Any Tier 1 tasks should already be in Supabase.
No additional "session summary" task is needed.
