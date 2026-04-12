# Multi-Agent Task Coordination Protocol

> MC Task: cd287a2e
> Status: Approved (CEO, 2026-04-11)
> Size: M

## Problem Statement

Shishka OS runs multiple parallel Claude Code sessions (agent windows). Without coordination:

1. **Invisible work** — an agent starts a task but never sets `status=in_progress`, so other agents don't see it's taken.
2. **Task collisions** — two agents pick up the same inbox task and produce conflicting work.
3. **Stale sessions** — an agent claims a task, then the session dies. The task stays `in_progress` forever, blocking others.
4. **Dependency violations** — an agent starts a task whose prerequisite isn't done yet, producing broken output.
5. **Branch conflicts** — two agents work on the same git branch simultaneously, causing force-push wars or merge chaos.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Locking mechanism | Optimistic claim + verify | 2-3 concurrent agents, not 200. DB-level locking is overkill. |
| Stale detection | Timestamp + git log | No background heartbeat process needed. Simpler, no infra. |
| Dependency tracking | `blocked_by` in `related_ids` | Advisory, not enforced at DB level. Junction table is overkill for current scale. |
| Stale takeover | Always ask CEO | Never auto-takeover. CEO decides if previous session's work should be preserved or discarded. |
| Branch rule | One branch = one agent | Hard rule. Ask CEO for exceptions. |

## Pickup Algorithm

### Step 1: Check In-Progress Tasks

```
list_tasks(status="in_progress")
```

For each task:
- If `related_ids.claimed_by == MY_SESSION_ID` → **resume** this task (load context, continue).
- Else → check if stale (see Stale Detection below).
  - If stale → offer CEO takeover: "Task [title] was claimed by [session] at [time] but shows no git activity for 90+ min. Take over?"
  - If not stale → skip (another agent is actively working on it).

### Step 2: Filter Inbox Tasks

If no task to resume:

```
list_tasks(status="inbox")
```

Filter out tasks where:
- `related_ids.blocked_by` references a task that is NOT `status=done`
- `parent_task_id` references a task with `status` not in `[in_progress, done]`
- `related_ids.git_branch` matches another `in_progress` task's branch

Sort remaining by priority (critical > high > medium > low).
Present top 1-3 to CEO for selection.

### Step 3: Claim Gate

First action after CEO selects a task:

```
update_task(
  task_id=TASK_ID,
  status="in_progress",
  assigned_to=SESSION_ID,
  related_ids={
    claimed_by: SESSION_ID,
    claimed_at: ISO_NOW,
    phase: "context-loading"
  }
)
```

### Step 4: Verify Claim

Immediately after claiming:

```
get_task(task_id=TASK_ID)
```

Check: `related_ids.claimed_by == MY_SESSION_ID`. If yes → proceed. If no → another agent claimed it first. Go back to Step 2.

## Stale Detection

Two-layer check (both must be true to declare stale):

1. **Time layer:** `related_ids.claimed_at` is more than **2 hours** ago.
2. **Activity layer:** No git commits on `related_ids.git_branch` (if set) in the last **90 minutes**.

If the task has no `git_branch` in `related_ids`, fall back to time-only check (2 hours).

**Important:** Never auto-takeover. Always present findings to CEO and wait for explicit approval.

## Phase Tracking

Agents update `related_ids.phase` as work progresses through these stages:

| Phase | Description |
|---|---|
| `context-loading` | Reading spec, context files, understanding task |
| `implementation` | Writing code, creating files |
| `testing` | Running builds, lints, tests |
| `review` | Creating PR, final verification |
| `done` | Task completed and MC updated |

Update via:
```
update_task(task_id=ID, related_ids={phase: "implementation"})
```

## Structured Handoff Protocol

When a session ends mid-task (WIP), the agent must leave a machine-readable AND human-readable trail:

### Machine-readable (`related_ids`)

```json
{
  "claimed_by": "SESSION_ID",
  "claimed_at": "2026-04-12T10:00:00Z",
  "phase": "implementation",
  "git_branch": "feature/shared/multi-agent-coordination",
  "last_commit": "abc1234"
}
```

### Human-readable (`notes`)

Format:
```
Done: [what was completed].
Remaining: [what's left to do].
Blockers: [anything blocking progress, or "none"].
Branch: [branch name]. Last commit: [hash].
```

The next agent reads both: `related_ids` for quick machine parsing, `notes` for full human context.

## Dependencies

Tasks can declare soft dependencies via `related_ids`:

```json
{
  "blocked_by": "task-uuid-here"
}
```

During inbox filtering (Step 2), agents check if the `blocked_by` task is `done`. If not, the task is filtered out of the pickup list.

Parent-child relationships use `parent_task_id`. An agent should not pick up a child task if the parent hasn't started (`status` not in `[in_progress, done]`).

These are **advisory** — no DB-level enforcement. Agents respect them during pickup filtering.

## Branch Exclusivity

**Rule: One git branch = one agent at a time.**

Before claiming a task:
1. Check if `related_ids.git_branch` is set on the task.
2. Query: are there other `in_progress` tasks with the same `git_branch` in their `related_ids`?
3. If yes → do NOT claim. Report to CEO: "Branch [X] is already in use by task [Y]. Pick a different task or wait?"

Exceptions require explicit CEO approval.

## Race Condition Handling

With 2-3 agents, true races are rare but possible. The protocol uses optimistic concurrency:

1. Agent A and Agent B both see task X in inbox.
2. Both attempt to claim (Step 3).
3. Both calls succeed (Supabase doesn't reject either update).
4. Both run Step 4 (verify). Only the **last writer** will see their `claimed_by` in the result.
5. The agent whose `claimed_by` doesn't match → backs off, picks another task.

This is a simple last-writer-wins model. At our scale (2-3 agents), the probability of collision is low, and the recovery cost (pick another task) is trivial.

## Session ID Generation

Session IDs are short, human-readable identifiers for agent sessions:

Format: `claude-{model}-session-{MMDD}-{seq}`

Examples:
- `claude-opus-session-0412`
- `claude-sonnet-session-0412-2` (second session that day)

Used in: `assigned_to`, `related_ids.claimed_by`.

Not globally unique across all time — only needs to be unique among currently-active sessions.
