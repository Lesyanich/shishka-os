# Phase 2: Smart Kitchen & KDS

**Date:** 2026-03-09
**Status:** COMPLETED

## What Was Built

CEO-facing Gantt scheduler (KDSBoard) and mobile-first cook execution UI (CookStation).

### Migration 016: KDS Scheduling
- `scheduled_start TIMESTAMPTZ` — CEO-assigned start time
- `duration_min INTEGER` — Expected duration
- `equipment_id UUID FK→equipment` — Which station runs the task
- `theoretical_yield NUMERIC` — Expected output weight
- `actual_weight NUMERIC` — Cook-entered actual weight
- `theoretical_bom_snapshot JSONB` — Frozen BOM at task start

### New RPC
- `fn_start_production_task(UUID)` — Sets status=in_progress, actual_start=now(), freezes BOM snapshot

### Realtime
- `production_tasks` added to `supabase_realtime` publication
- Hooks `useGanttTasks` and `useCookTasks` subscribe via `supabase.channel().on('postgres_changes')`

### Frontend Files
| File | Purpose |
|---|---|
| `src/pages/KDSBoard.tsx` | CEO Gantt scheduling view |
| `src/pages/CookStation.tsx` | Mobile-first cook execution UI |
| `src/hooks/useGanttTasks.ts` | Gantt tasks + conflict detection + Realtime |
| `src/hooks/useEquipmentCategories.ts` | Equipment list + category filter |
| `src/hooks/useCookTasks.ts` | Cook tasks + startTask RPC + completeTask |
| `src/components/kds/GanttTimeline.tsx` | Gantt container with conflict banner |
| `src/components/kds/GanttRow.tsx` | Equipment row with task bars |
| `src/components/kds/GanttTaskBar.tsx` | Positioned task bar (CSS %) |
| `src/components/kds/TimeHeader.tsx` | 24h time ruler |
| `src/components/kds/EquipmentFilter.tsx` | Category pill filter |
| `src/components/kds/TaskExecutionCard.tsx` | Cook card: Start/Timer/Complete |
| `src/components/kds/DeviationBadge.tsx` | Variance badge |
| `src/components/kds/BOMSnapshotPanel.tsx` | Modal: frozen BOM ingredients |

### Data Flow
- GanttTimeline ← `production_tasks` + `equipment` (WHERE scheduled_start IS NOT NULL + Realtime)
- TaskExecutionCard → RPC `fn_start_production_task` / UPDATE
- DeviationBadge — computed: `((actual/expected)-1)*100`
