---
name: task-lifecycle
description: "Complete task workflow: pick up MC task → work → test → PR → MC update. Includes multi-agent coordination: claim gate, stale detection, branch exclusivity, phase tracking. Triggers: task done, finish task, create PR, what should I work on, start session, pick up task."
---

# Task Lifecycle — Claude Code Workflow

## Session Start: Pick Up Task (Multi-Agent Safe)

When starting a new session, BEFORE any work, follow this algorithm to avoid collisions with other agent windows.

> Full design rationale: `docs/plans/spec-multi-agent-coordination.md`

### Step 1: Check In-Progress Tasks

```
list_tasks(status="in_progress")
```

For each task found:
- If `related_ids.claimed_by == MY_SESSION_ID` → **resume** this task. Load `notes`, `spec_file`, `context_files`. Continue from where you left off.
- Else → **stale check**:
  - `related_ids.claimed_at` is more than **2 hours** ago, AND
  - No git commits on `related_ids.git_branch` in the last **90 minutes** (check with `git log --since="90 minutes ago" origin/{branch}`)
  - If BOTH true → offer CEO takeover: "Task [title] was claimed by [session] at [time] but shows no git activity for 90+ min. Take over?"
  - If NOT stale → skip (another agent is actively working on it)
  - **NEVER auto-takeover.** Always wait for CEO approval.

### Step 2: Filter Inbox Tasks

If no task to resume:

```
list_tasks(status="inbox", priority="critical")
list_tasks(status="inbox", priority="high")
```

**Filter OUT** tasks where:
- `related_ids.blocked_by` references a task that is NOT `status=done`
- `parent_task_id` references a task with `status` not in `[in_progress, done]`
- `related_ids.git_branch` matches another `in_progress` task's branch (see Branch Exclusivity)

Sort remaining by priority. Present top 1-3 to CEO for selection.

### Step 3: Claim Gate

**First action** after CEO selects a task — claim it atomically:

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

Session ID format: `claude-{model}-session-{MMDD}` (e.g., `claude-opus-session-0412`).

### Step 4: Verify Claim

Immediately after claiming:

```
get_task(task_id=TASK_ID)
```

Check: `related_ids.claimed_by == MY_SESSION_ID`.
- **Yes** → proceed to context loading.
- **No** → another agent claimed it first. Go back to Step 2, pick another task.

### Step 5: Load Task Context

- `get_task(id)` → read `description`, `notes`, `context_files`, `spec_file`
- If `spec_file` exists → read it (this is your detailed instructions)
- If `context_files` is non-empty → load ONLY those files + `docs/constitution/core-rules.md`
- If `context_files` is empty → fall back to `docs/constitution/context-routing.md` for L1/L2 module routing

### Step 6: Set Up Branch

- Task notes, spec, or handoff comment should specify the branch
- If not specified: `feature/{project}/{short-description}`
- Check: `git branch --show-current` — are you on the right branch?
- Update `related_ids.git_branch` if not already set:
  ```
  update_task(task_id=ID, related_ids={git_branch: "feature/..."})
  ```

## Phase Tracking

As you work, update `related_ids.phase` to reflect your current stage:

| Phase | When to set |
|---|---|
| `context-loading` | Set during claim gate (Step 3) |
| `implementation` | Starting to write code / create files |
| `testing` | Running builds, lints, tests |
| `review` | Creating PR, final verification |
| `done` | Task completed, MC updated |

Update via:
```
update_task(task_id=ID, related_ids={phase: "implementation"})
```

Other agent windows can read this to understand where you are without interrupting.

## Branch Exclusivity

**Rule: One git branch = one agent at a time.**

Before claiming a task (Step 3):
1. Check if the task specifies a `git_branch` (in notes, spec, or `related_ids`).
2. Query: are there other `in_progress` tasks with the same `git_branch` in their `related_ids`?
3. If yes → do NOT claim. Report to CEO: "Branch [X] is already in use by task [Y]. Pick a different task or wait?"

Exceptions require explicit CEO approval.

## During Work: Guard Rails (automatic)

These run automatically via git hooks — you don't need to think about them:
- **Pre-commit (Husky):** tsc + ESLint + AI-TDD gate + migration canary
- **Post-commit:** generate_status (STATUS.md auto-update)

If a commit is blocked → read the error, fix the issue, re-commit.

## Task Completion Checklist

When you believe the task is done, go through this checklist IN ORDER:

### Step 1: Verify build
```bash
cd apps/admin-panel && npm run build && cd ../..
```
Must be green. If not → fix before continuing.

### Step 2: Verify lint
```bash
cd apps/admin-panel && npm run lint && cd ../..
```
For MCP services (if touched):
```bash
cd services/mcp-{name} && npm run lint && cd ../..
```

### Step 3: Update MC task
```
update_task(task_id="...", status="done", notes="Result: [what was done]. Deliverables: [files/PRs].")
```

### Step 4: Push branch
```bash
git push -u origin $(git branch --show-current)
```

### Step 5: Create PR
```bash
gh pr create --title "[type]: short description" --body "## Summary
- [what changed]

## MC Task
- ID: [task_id]

## Test plan
- [ ] build passes
- [ ] lint passes
- [ ] [specific tests]"
```

### Step 6: Update MC with PR
```
update_task(task_id="...", related_ids={"pr_number": N, "git_branch": "feature/..."})
```

### Step 7: Report to user
"Task [title] done. PR #N created. MC updated."

## Structured Handoff (WIP)

If you can't finish in this session, leave a machine-readable AND human-readable trail so the next agent can continue seamlessly.

### Machine-readable: `related_ids`

Update these fields before session ends:
```
update_task(task_id=ID, related_ids={
  claimed_by: SESSION_ID,
  claimed_at: ORIGINAL_CLAIM_TIME,
  phase: CURRENT_PHASE,
  git_branch: BRANCH_NAME,
  last_commit: COMMIT_HASH
})
```

### Human-readable: `notes`

Write clear, actionable notes:
```
update_task(task_id=ID, notes="Done: [what was completed]. Remaining: [what's left]. Blockers: [any blockers, or 'none']. Branch: [name]. Last commit: [hash].")
```

### Commit WIP code

```bash
git add -A && git commit -m "wip: [what's done so far]"
```

The NEXT agent will:
1. See this task in `list_tasks(status="in_progress")`
2. Read `related_ids` for machine context (phase, branch, last commit)
3. Read `notes` for human context (done/remaining/blockers)
4. Check out the branch and continue from `last_commit`

## Discovery Protocol

If you find work OUTSIDE your current task:

1. Do NOT start working on it
2. Create MC task:
   ```
   emit_business_task(title="...", domain="...", created_by="code-agent", source="agent_discovery", related_ids={...})
   ```
3. Continue with your current task
