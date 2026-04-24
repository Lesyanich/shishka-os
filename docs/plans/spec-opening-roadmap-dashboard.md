# Spec: Opening Roadmap Dashboard

> **MC Task:** `5e87c9b2-2626-411a-a376-51d64f267229`
> **Parent Initiative:** `7d78f1c4-825b-4e2e-bf94-cbae3ba09172` — L2 Opening Roadmap
> **Replaces:** `ControlCenter.tsx` at route `/`
> **Author:** Tech-Lead, 2026-04-24

## 1. Problem

The Control Center (`/`) shows generic KPIs (kitchen kanban, CapEx chart, BOM health, equipment alerts) that the CEO finds useless for the current top priority: preparing L2 for opening. CEO and partner (Bas) need a single screen showing where the opening project stands, what's blocked, and what to focus on next.

## 2. Solution

Replace the Control Center page content with an **Opening Roadmap Dashboard** — a phase-based visual tracker showing 6 opening phases with progress, blockers, and task details.

**NOT a task list** (Mission Control already does that). This is a curated, phase-structured view with visual progress indicators.

## 3. Data Architecture

### 3.1 No new tables

Use existing `business_tasks` table. Phase mapping via tags:

- Tasks under parent initiative `7d78f1c4` (via `parent_task_id`)
- Each task tagged with `phase-0` through `phase-5` to assign it to a phase
- Blocker tasks additionally tagged `opening-blocker`

### 3.2 Phase definitions (frontend config)

Hardcoded in a TypeScript config — these phases are specific to this opening and won't change frequently:

```typescript
export const OPENING_PHASES = [
  {
    id: 0,
    tag: 'phase-0',
    title: 'Recipe Lock',
    subtitle: 'Stop experiments, finalize Day 1 menu',
    icon: 'Lock',          // lucide icon name
    lockDay: '2026-04-28', // special: countdown display
  },
  {
    id: 1,
    tag: 'phase-1',
    title: 'Recipe Cards',
    subtitle: 'BOM + SOPs for each Day 1 dish',
    icon: 'ClipboardList',
  },
  {
    id: 2,
    tag: 'phase-2',
    title: 'Prep & Freeze',
    subtitle: 'Frozen manaeesh pipeline, test batches',
    icon: 'Snowflake',
  },
  {
    id: 3,
    tag: 'phase-3',
    title: 'L2 Station',
    subtitle: 'WiFi, equipment, furniture, layout',
    icon: 'Store',
  },
  {
    id: 4,
    tag: 'phase-4',
    title: 'Training',
    subtitle: 'Team executes without Bas',
    icon: 'Users',
  },
  {
    id: 5,
    tag: 'phase-5',
    title: 'Soft Opening',
    subtitle: 'Limited launch, collect feedback',
    icon: 'Rocket',
  },
] as const
```

### 3.3 Data hook: `useOpeningRoadmap`

```typescript
interface RoadmapTask {
  id: string
  title: string
  status: 'inbox' | 'backlog' | 'in_progress' | 'blocked' | 'done' | 'cancelled'
  priority: 'critical' | 'high' | 'medium' | 'low'
  isBlocker: boolean
  phase: number // 0-5, derived from phase-N tag
  due_date: string | null
}

interface PhaseData {
  config: typeof OPENING_PHASES[number]
  tasks: RoadmapTask[]
  progress: number       // 0-100, done/(done+active) tasks
  blockerCount: number
  status: 'not_started' | 'in_progress' | 'blocked' | 'done'
}

function useOpeningRoadmap(): {
  phases: PhaseData[]
  overallProgress: number
  totalBlockers: number
  isLoading: boolean
  error: string | null
  refetch: () => void
}
```

**Query:**
```typescript
supabase
  .from('business_tasks')
  .select('id, title, status, priority, tags, due_date')
  .eq('parent_task_id', INITIATIVE_ID)
  .not('status', 'eq', 'cancelled')
```

Phase assignment: parse `tags` array for `phase-N` pattern. Tasks without a phase tag go into an "Unassigned" bucket (shown as warning).

## 4. UI Components

### 4.1 Page layout

```
┌──────────────────────────────────────────────────────┐
│  🚀 Opening Roadmap          Overall: ██████░░ 35%   │
│  Lock Day: 28 Apr (4 days left)     12 blockers      │
├──────────────────────────────────────────────────────┤
│                                                      │
│  [Phase 0] ━━━━━━━━━░░  80%  ← current focus        │
│    ✅ Lock Day confirmed                             │
│    ✅ Day 1 menu drafted                             │
│    🔴 Dough sheeter (BLOCKER)                        │
│    ⏳ Finalize chicken+cheese manaeesh               │
│                                                      │
│  [Phase 1] ━━░░░░░░░░  15%                           │
│    ...tasks...                                       │
│                                                      │
│  [Phase 2] ░░░░░░░░░░   0%  (locked: Phase 1 first) │
│  [Phase 3] ━━░░░░░░░░  20%                           │
│  [Phase 4] ░░░░░░░░░░   0%                           │
│  [Phase 5] ░░░░░░░░░░   0%                           │
└──────────────────────────────────────────────────────┘
```

### 4.2 Component tree

```
OpeningRoadmap (page)
├── RoadmapHeader
│   ├── Overall progress bar
│   ├── Lock Day countdown badge
│   └── Total blockers count
├── PhaseCard[] (one per phase, collapsible)
│   ├── PhaseHeader (icon + title + progress bar + status badge)
│   └── PhaseTaskList (expandable)
│       └── RoadmapTaskRow[] 
│           ├── Status icon (✅ / ⏳ / 🔴 / ⬜)
│           ├── Title
│           ├── Priority badge (if critical/high)
│           └── Blocker badge (if opening-blocker)
└── UnassignedTasks (warning section, if any tasks lack phase tag)
```

### 4.3 File structure

```
src/
├── pages/
│   └── OpeningRoadmap.tsx          # page component (replaces ControlCenter import in App.tsx)
├── components/
│   └── roadmap/
│       ├── roadmap-config.ts       # OPENING_PHASES config
│       ├── RoadmapHeader.tsx       # overall stats + Lock Day countdown
│       ├── PhaseCard.tsx           # single phase with progress
│       ├── PhaseTaskList.tsx       # task list within a phase
│       └── RoadmapTaskRow.tsx      # single task row
├── hooks/
│   └── useOpeningRoadmap.ts        # data hook
```

### 4.4 Design tokens (dark theme, consistent with admin panel)

| Element | Style |
|---------|-------|
| Phase card | `bg-zinc-900/60 border border-zinc-800 rounded-xl` |
| Progress bar track | `bg-zinc-800 rounded-full h-2` |
| Progress bar fill | `bg-emerald-500` (normal) / `bg-amber-500` (blocked) / `bg-emerald-400` (done) |
| Blocker badge | `bg-red-900/50 text-red-300 border border-red-800/50` |
| Current phase | `ring-2 ring-emerald-500/30` highlight |
| Done phase | Muted, collapsed by default |
| Lock Day countdown | `bg-amber-900/40 text-amber-300` badge with days remaining |
| Status icons | ✅ done=`text-emerald-400`, ⏳ in_progress=`text-amber-400`, 🔴 blocker=`text-red-400`, ⬜ pending=`text-zinc-600` |

### 4.5 Interactions

- **Collapse/expand** phases — click phase header. Current phase auto-expanded, done phases auto-collapsed.
- **Click task** — navigates to `/mission?task={id}` (deep link to MC task detail, if MC supports it; otherwise no-op for now).
- **Mobile responsive** — single column, phase cards stack vertically, progress bars full-width.
- **Auto-refresh** — poll every 60s or use Supabase realtime subscription on `business_tasks`.

## 5. Migration plan (route swap)

### 5.1 App.tsx changes

```diff
- import { ControlCenter } from './pages/ControlCenter'
+ import { OpeningRoadmap } from './pages/OpeningRoadmap'

  <Route path="/" element={<ControlCenter />} />
+ <Route path="/" element={<OpeningRoadmap />} />
```

Keep `ControlCenter.tsx` and its components — don't delete. Tag with `// DEPRECATED: replaced by OpeningRoadmap 2026-04-24` comment at top.

### 5.2 AppShell.tsx sidebar change

```diff
- { path: '/', icon: LayoutDashboard, label: 'Control Center' },
+ { path: '/', icon: Rocket, label: 'Opening Roadmap' },
```

## 6. Task tagging prerequisite

Before the dashboard is useful, the Strategic COO needs to:
1. Create missing tasks for all roadmap items (Bas checklist)
2. Tag all tasks with `phase-N` tags
3. Set `parent_task_id` to initiative `7d78f1c4`
4. Tag blockers with `opening-blocker`

This is a **parallel track** — /code builds the UI, strategy tags the tasks. Dashboard will show "0 tasks" per phase until tasks are tagged, which is acceptable.

## 7. Out of scope

- Drag-and-drop reordering
- Phase editing from UI (hardcoded config is fine for opening)
- Gantt chart / timeline view
- Dependencies between phases (visual only — "Phase 1 first" text)
- Notifications / push alerts
- Old Control Center widgets (they stay in code, just not rendered)

## 8. Acceptance criteria

1. Route `/` shows Opening Roadmap instead of Control Center
2. 6 phases displayed with correct titles and icons
3. Tasks from MC grouped by phase tag, with correct status icons
4. Progress bars computed from task completion ratio
5. Blocker badges shown on tasks tagged `opening-blocker`
6. Lock Day countdown shows days remaining until 2026-04-28
7. Current phase (first non-done phase with tasks) auto-expanded
8. Mobile-responsive layout (tested at 375px width)
9. Sidebar label updated to "Opening Roadmap"
10. Old ControlCenter.tsx preserved but not rendered
