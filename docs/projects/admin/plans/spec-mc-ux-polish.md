# Spec: Mission Control UX Polish
> Task ID: 4cb3dac4-45ff-4f76-bb76-4cee0ed1c483
> Priority: high
> Domain: tech
> Estimated: 1 session (~45 min)
> Assignee: Claude Code (Admin Panel Dev)

## Context
Mission Control page exists (`/mission`) with kanban/list views, domain filter, quick add.
CEO uses it daily for task triage. Current UX issues make triage slower than it should be.
Status summary badges (Inbox: 1, Backlog: 4, etc.) are currently NOT clickable — just display.

## Scope (5 items)

### 1. Clickable status filter (MOST IMPORTANT)
**Problem:** Status badges at the top (Inbox, Backlog, In Progress, etc.) are not interactive. CEO cannot filter by status.
**Fix:** Make status summary badges clickable toggles:
- Click a badge → filter tasks to only that status
- Click again → remove filter (show all)
- Active filter = highlighted badge (solid bg instead of outline)
- Default state: Done is HIDDEN. User must click "Done" badge to see completed tasks.
- Works in both list and kanban views

**Where:** `MissionControl.tsx` — add `activeStatus` state, wire up onClick on status badges, pass filter to task list and kanban.

### 2. Hide Done by default
**Problem:** 10 done tasks clutter the view. CEO mainly needs inbox/backlog/in_progress.
**Fix:**
- On page load, filter OUT status="done" and status="cancelled"
- Show a subtle "Done: 10" badge (grayed out) that user can click to reveal
- In kanban view: hide the Done column by default, show toggle "Show Done"

**Where:** `MissionControl.tsx` (default filter state), `KanbanBoard.tsx` (column visibility).

### 3. Priority color badges
**Problem:** All priorities look the same — plain text badges.
**Fix:** Color-code priority badges:
- `critical` → red bg (`bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400`)
- `high` → orange bg (`bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400`)
- `medium` → blue bg (`bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400`)
- `low` → gray bg (`bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400`)

**Where:** `TaskListItem` in `MissionControl.tsx` and `KanbanBoard.tsx` task cards.

### 4. Tags display on kanban cards
**Problem:** Tags exist in data but not visible on kanban cards.
**Fix:** Show tags as small pills on KanbanBoard task cards. Max 3 visible, "+N" for overflow.
Special tags get color: `has-spec` = green, `blocked` = red, `needs-hardware` = yellow, `quick-win` = blue.

**Where:** `KanbanBoard.tsx` task card rendering.

### 5. Task count in domain tabs
**Problem:** Only "All" tab shows count (16). Other domain tabs don't show how many tasks are in each.
**Fix:** Show count badge next to each domain name: Kitchen (2), Tech (5), etc.
Only count tasks matching current status filter (not total).

**Where:** `MissionControl.tsx` domain filter tabs.

## Out of scope
- No new DB queries or schema changes
- No new dependencies
- No changes to TaskDetailPanel
- No drag-and-drop (future task)
- No sorting controls (future task)

## Definition of Done
1. Status badges are clickable filters in both views
2. Done tasks hidden by default, revealable
3. Priority badges are colored in both list and kanban views
4. Tags visible on kanban cards with special colors
5. Domain tabs show task counts
6. No TypeScript errors
7. Dark mode colors work (app uses dark theme)
8. Commit, push, create PR to main, report PR URL
9. Update task in MC: `update_task(task_id, status="done")`

## Files to modify
- `apps/admin-panel/src/pages/MissionControl.tsx`
- `apps/admin-panel/src/components/mission-control/KanbanBoard.tsx`
- `apps/admin-panel/src/hooks/useBusinessTasks.ts` (if filter logic needs updating)
