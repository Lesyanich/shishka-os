# Staff Schedule Module Context

## Tables (Migration 069 — pending apply)
- `staff` (id UUID) — Kitchen staff: name, name_th, role, phone, pin_code, is_active
- `shifts` (id UUID) — Staff shifts: staff_id FK, location_id FK, shift_date, start_time, end_time, break_minutes, status, notes
- `shift_tasks` (id UUID) — Tasks within a shift: shift_id FK, production_task_id FK, equipment_id FK, task_description, start_time, end_time, priority, status
- `equipment_slots` (id UUID) — Equipment time slots: equipment_id FK, slot_date, start_time, end_time, shift_task_id FK, production_task_id FK, label

## RLS
- staff/shifts/shift_tasks/equipment_slots: anon SELECT (for /kitchen open dashboard) + authenticated ALL

## Realtime
- `shifts` and `equipment_slots` published via Supabase Realtime

## Frontend

### Pages
| File | Purpose |
|---|---|
| `src/pages/ScheduleManager.tsx` | Protected. 3-tab layout: Staff, Weekly Calendar, Bulk Generation |
| `src/pages/KitchenDashboard.tsx` | **Public (no auth)**. Mobile-first coordinator dashboard. 4 cards: active shifts, active tasks, equipment timeline, upcoming tasks |

### Schedule Components
| File | Purpose |
|---|---|
| `src/components/schedule/StaffList.tsx` | Staff roster CRUD with role filtering |
| `src/components/schedule/StaffForm.tsx` | Create/edit staff, auto PIN generation |
| `src/components/schedule/WeekCalendar.tsx` | Weekly grid view of shifts per staff member |
| `src/components/schedule/ShiftEditor.tsx` | Modal: edit individual shift + manage tasks |
| `src/components/schedule/ShiftTaskEditor.tsx` | Inline task editor: time, equipment, priority |
| `src/components/schedule/EquipmentAllocation.tsx` | Equipment conflict display within a shift |
| `src/components/schedule/BulkScheduleGenerator.tsx` | Templates: 5/2, 2/2, every-day shift generation |
| `src/components/schedule/KitchenQR.tsx` | QR code generator linking to /kitchen |

### Kitchen Dashboard Components
| File | Purpose |
|---|---|
| `src/components/kitchen-dashboard/ActiveShifts.tsx` | Currently active shifts card |
| `src/components/kitchen-dashboard/ActiveTasks.tsx` | In-progress tasks card |
| `src/components/kitchen-dashboard/EquipmentTimeline.tsx` | Equipment load timeline (Gantt-style) |
| `src/components/kitchen-dashboard/UpcomingTasks.tsx` | Next tasks in queue |

### Hooks
| Hook | Table | Realtime |
|---|---|---|
| `useStaff` | staff | no |
| `useShifts` | shifts | yes |
| `useShiftTasks` | shift_tasks | no |
| `useEquipmentSlots` | equipment_slots | yes |
| `useKitchenDashboard` | shifts + shift_tasks + equipment_slots | yes (all 3) |

## Integration Stubs
| File | Purpose |
|---|---|
| `src/lib/printing.ts` | PrintService interface — future XP-365B thermal printer |
| `src/lib/scanner.ts` | ScannerService interface — future camera barcode scanning |

## Patterns & Gotchas
- /kitchen is OUTSIDE ProtectedRoute (open access for kitchen coordinator)
- Migration 069 must be applied before any of these pages work
- Equipment timeline is the key bottleneck visibility tool
- Shift templates (5/2, 2/2) auto-generate multiple shifts at once

-> Schema: `04_Knowledge/Architecture/Database Schema.md`
-> Related: `docs/context/projects/admin/modules/kitchen.md` (KDS/CookStation)
