# Multi-Agent Task Coordination Protocol

> MC Task: cd287a2e (v1, merged PR #51 2026-04-21)
> v2 Task: 3f41841d (in_progress, follow-up addressing v1 enforcement gaps)
> Status: Approved (CEO, 2026-04-11; v2 scope CEO-approved 2026-04-28)
> Size: M

## v2 Architecture Revision (2026-04-28)

v1 shipped the protocol as convention. v2 makes it enforced. Three additions:

1. **Unique session IDs** (`Session ID Generation` section, revised) — replaces collision-prone date-only format with Claude Code's own `session_id` (8-char prefix) or fallback `MMDD-HHMM-rand4`.
2. **Active SessionStart hook** (`Active Session Start` section, new) — `scripts/session-start.sh` now calls MC live, injects `additionalContext` JSON listing every `in_progress` task with `claimed_by` flagged.
3. **PreToolUse claim-gate hook** (`Claim Gate Enforcement` section, new) — `.claude/hooks/claim-gate-pretool.sh` matches `mcp__shishka-mission-control__update_task`. On `status=in_progress` claim attempts, queries MC; if task is fresh-claimed by another session, returns `permissionDecision: "deny"` so Claude Code blocks the call before it reaches Supabase.

Trigger: today 2026-04-28 two parallel sessions both claimed task 2d709466 because both generated session ID `claude-opus-session-0428` (same date). Tech-lead's PR #51 monitor predicted this gap.

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

## Session ID Generation (v2 — revised)

> v1 used `claude-{model}-session-{MMDD}` and the `-{seq}` suffix was advisory only. This caused two same-day sessions to share an ID and silently collude on the same task. v2 replaces the format.

Session IDs are short, human-readable, **globally unique** identifiers:

Format: `claude-{model}-session-{suffix}`

Where `suffix` is, in order of preference:
1. **First 8 chars of Claude Code's own `session_id`** (from SessionStart hook payload). E.g. session_id `abc12345-def6-7890-abcd-ef1234567890` → suffix `abc12345`. Already globally unique by Claude Code's UUID guarantee.
2. **Fallback** when no Claude session_id is available (manual generation, scripted use): `{MMDD}-{HHMM}-{rand4}`. E.g. `0428-1050-700d`. Time + 16-bit random gives collision probability ≈ 0 within a single day.

Examples:
- `claude-opus-session-abc12345` (hook-driven, preferred)
- `claude-opus-session-0428-1050-700d` (fallback)
- `claude-sonnet-session-f1e2d3c4`

**Generation:**
```sh
sh scripts/new-session-id.sh                       # standalone (fallback format)
sh scripts/new-session-id.sh "<claude_session_id>" # explicit (hook format)
echo '<json>' | sh scripts/new-session-id.sh       # parse from SessionStart JSON payload
```

**Persistence:** the active SessionStart hook writes the chosen ID to `.claude/.session-id` (per worktree). All downstream tools — `task-lifecycle` skill, `claim-gate-pretool.sh`, manual scripts — read from this file. On `source: resume`, the existing file is preserved.

Used in: `assigned_to`, `related_ids.claimed_by`.

## Active Session Start (v2 — new)

`scripts/session-start.sh` runs at every Claude Code session start and now does three things actively:

1. **Seeds `.claude/.session-id`** using Claude's `session_id` from the hook payload (or fallback).
2. **Curls MC live**: queries `business_tasks?status=eq.in_progress` via Supabase REST with `SUPABASE_SERVICE_ROLE_KEY` from macOS Keychain.
3. **Emits JSON `additionalContext`** to Claude Code:
   ```json
   {
     "hookSpecificOutput": {
       "hookEventName": "SessionStart",
       "additionalContext": "...My session ID: ...\nLive MC tasks (status=in_progress):\n  - <id> | <title>\n      claimed_by=<sid> phase=<p> branch=<b>  ⚠ OWNED BY ANOTHER SESSION\n..."
     }
   }
   ```
   The `⚠ OWNED BY ANOTHER SESSION` marker fires whenever a task's `claimed_by != MY_SESSION_ID`. Claude Code surfaces this as `<system-reminder>` at session start, so the agent knows about live conflicts before any tool call.

**Failure modes are non-fatal:** if MC is unreachable, Keychain lookup fails, or `jq`/`curl` is missing, the hook falls back to plain-text output and never blocks session start. The PreToolUse claim-gate (below) catches collisions even if SessionStart degraded.

## Claim Gate Enforcement (v2 — new)

> v1 specified the claim algorithm as skill text. v2 makes it harness-enforced.

Hook: `.claude/hooks/claim-gate-pretool.sh`
Event: `PreToolUse`
Matcher: `mcp__shishka-mission-control__update_task`
Wired in: `.claude/settings.json` → `hooks.PreToolUse[]`.

**Trigger condition:** every call to `update_task` where `tool_input.status == "in_progress"`.

**Logic:**
1. Read `tool_input.task_id` and `MY_SESSION_ID` from `.claude/.session-id`.
2. Curl MC for current task state.
3. Decide:
   - No `claimed_by` on existing task → **allow** (fresh claim).
   - `claimed_by == MY_SESSION_ID` → **allow** (re-claim or phase update).
   - `claimed_at > 2h` ago → **allow** (stale takeover, CEO already approved per skill).
   - Else → **deny** with structured reason:
     ```json
     {
       "hookSpecificOutput": {
         "hookEventName": "PreToolUse",
         "permissionDecision": "deny",
         "permissionDecisionReason": "Task <id> is currently claimed by '<other>' (you are '<me>') on branch '<b>'. Per multi-agent coordination protocol, you MUST NOT take over a task held by an active session..."
       }
     }
     ```

**Fail-open philosophy:** missing keychain key, network error, missing `jq`/`curl`, missing `.session-id` → all exit 0 (allow). The hook only blocks on **proven** collisions where it can confirm MC state. Infrastructure problems must not paralyze agent work.

**Non-status updates pass through:** updating `phase`, `notes`, `pr_number`, etc. on a claimed task is unrestricted — only the actual claim moment (`status: in_progress` transition) is policed.

**Testing:** five scenarios verified end-to-end (own claim, foreign claim, phase update, free task, wrong tool) — see PR description for command transcripts.
