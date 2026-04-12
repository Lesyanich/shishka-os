---
name: task-lifecycle
description: "Complete task workflow: pick up MC task → work → test → PR → MC update. Triggers: task done, finish task, create PR, закончил, готово, завершить задачу, what should I work on, start session, pick up task."
---

# Task Lifecycle — Claude Code Workflow

## Session Start: Pick Up Task

When starting a new session, BEFORE any work:

1. **Check in-progress tasks:**
   ```
   list_tasks(status="in_progress")
   ```
   If found → read the task's `notes` (WIP from previous agent), `spec_file`, `context_files`. Continue from where the last agent stopped.

2. **If no in-progress tasks:**
   ```
   list_tasks(status="inbox", priority="critical")
   list_tasks(status="inbox", priority="high")
   ```
   Present to user: "Found N tasks. Highest priority: [title]. Start this one?"

3. **Load task context:**
   - `get_task(id)` → read `description`, `notes`, `context_files`, `spec_file`
   - If `spec_file` exists → read it (this is your detailed instructions)
   - If `context_files` is non-empty → load ONLY those files + `docs/constitution/core-rules.md`
   - If `context_files` is empty → fall back to `docs/constitution/context-routing.md` for L1/L2 module routing

4. **Set up branch:**
   - Task notes or spec should specify the branch
   - If not specified: `feature/{project}/{short-description}`
   - Check: `git branch --show-current` — are you on the right branch?

## During Work: Guard Rails (automatic)

These run automatically via git hooks — you don't need to think about them:
- **Pre-commit (Husky):** tsc + ESLint + AI-TDD gate + migration canary
- **Post-commit:** generate_status (STATUS.md auto-update)

If a commit is blocked → read the error, fix the issue, re-commit.

## Post-Action Notes Update (CEO-Gated Steps)

When you perform a **CEO-gated action** — any step that was explicitly approved or requested by the CEO (apply migration, deploy, enable feature flag, run destructive command) — you MUST update MC task notes with the outcome **immediately after the action**, before moving on to the next step or marking done.

```
update_task(task_id="...", notes="Applied: [action]. Result: [outcome/output]. Timestamp: [now].")
```

**Why:** If you skip this, task notes stay stuck at an intermediate state (e.g. "needs manual apply") even after the action succeeded. The next agent or the CEO reading the task will see stale info.

**Rule:** action → verify result → update_task(notes) → continue. Never defer the notes update to the completion checklist.

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

## Partial Completion (WIP)

If you can't finish in this session:

1. **Commit WIP:**
   ```bash
   git add -A && git commit -m "wip: [what's done so far]"
   ```

2. **Update MC with WIP state:**
   ```
   update_task(task_id="...", notes="WIP: done [X, Y]. Remaining: [Z]. Branch: [name]. Last commit: [hash].")
   ```

3. The NEXT agent will read your notes and continue. Write clearly.

## Discovery Protocol

If you find work OUTSIDE your current task:

1. Do NOT start working on it
2. Create MC task:
   ```
   emit_business_task(title="...", domain="...", created_by="code-agent", source="agent_discovery", related_ids={...})
   ```
3. Continue with your current task
