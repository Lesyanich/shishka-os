# Backward Scheduling Module Context

## Concept
Deadline-based reverse scheduling: given a dish and a deadline, walk the BOM tree in reverse, allocate equipment time slots, and detect conflicts. Pure frontend arithmetic — no backend RPC needed.

## Algorithm (`src/lib/backwardSchedule.ts`)
```
Input:  dish (nomenclature_id) + deadline (datetime)
1. Walk BOM tree → extract recipe steps with durations
2. Sort steps by dependency order (deepest ingredient first)
3. For each step: end_time = predecessor_end (or deadline for last step)
                  start_time = end_time - duration
4. Check equipment conflicts: any overlap with existing equipment_slots?
5. Output: ScheduledStep[] + ConflictInfo[]
```

## Tables Used
- `nomenclature` — dish lookup
- `bom_structures` — BOM tree walk
- `equipment` — equipment capacity
- `equipment_slots` — existing allocations (conflict detection)
- `production_tasks` — optional: save generated schedule

## Frontend

### Page
| File | Purpose |
|---|---|
| `src/pages/BatchPlanner.tsx` | Protected. Combines DishSelector + BackwardScheduler + BackwardGantt |

### Components
| File | Purpose |
|---|---|
| `src/components/planner/BackwardScheduler.tsx` | Main scheduler: deadline input, BOM tree walk, step calculation |
| `src/components/planner/BackwardGantt.tsx` | Gantt visualization: equipment rows, time blocks, conflict highlights |
| `src/components/planner/DishSelector.tsx` | Dropdown: SALE-% nomenclature items |
| `src/components/planner/ConflictBadge.tsx` | Count badge for equipment conflicts |

### Hooks
| Hook | Purpose |
|---|---|
| `useRecipeSteps` | Fetches BOM tree for a nomenclature item, extracts recipe flow |
| `useEquipmentSlots` | Existing equipment allocations (Realtime) |

### Lib
| File | Purpose |
|---|---|
| `src/lib/backwardSchedule.ts` | Core algorithm: `scheduleBackward()` + `detectConflicts()` |

## Patterns & Gotchas
- Algorithm is pure function — testable without DB
- Conflict detection compares against equipment_slots table (requires migration 069)
- BOM tree walk is recursive — deeply nested dishes may have many steps
- Gantt shows equipment on Y-axis, time on X-axis (same pattern as KDS GanttTimeline)

-> Related: `docs/context/projects/admin/modules/kitchen.md` (KDS Gantt)
-> Related: `docs/context/projects/admin/modules/schedule.md` (equipment_slots)
-> Schema: `04_Knowledge/Architecture/Database Schema.md`
