# Kitchen / KDS Module Context

## Tables
- `production_tasks` (id UUID) — Kitchen tasks: scheduled_start, duration_min, equipment_id FK, theoretical_yield, actual_weight, theoretical_bom_snapshot JSONB, order_id FK
- `equipment` (id UUID) — 76 units with category, last_service_date
- `daily_plan` (id UUID) — Daily production plan

## RPCs
- `fn_start_kitchen_task(UUID)` — Sets status=in_progress (legacy)
- `fn_start_production_task(UUID)` — Sets status=in_progress, actual_start=now(), freezes BOM snapshot
- `fn_generate_production_order` — Auto-generates tasks with real BOM weights

## Realtime
- `production_tasks` published via `supabase_realtime`
- Hooks subscribe via `supabase.channel().on('postgres_changes')`

## Frontend
| File | Purpose |
|---|---|
| `src/pages/KDSBoard.tsx` | CEO Gantt scheduling view |
| `src/pages/CookStation.tsx` | Mobile-first cook execution UI |
| `src/hooks/useGanttTasks.ts` | Gantt tasks + conflict detection + Realtime subscription |
| `src/hooks/useEquipmentCategories.ts` | Equipment list + category filter |
| `src/hooks/useCookTasks.ts` | Cook tasks + startTask RPC + completeTask |
| `src/components/kds/GanttTimeline.tsx` | Gantt container with conflict banner |
| `src/components/kds/GanttRow.tsx` | Equipment row with task bars |
| `src/components/kds/GanttTaskBar.tsx` | Positioned task bar (CSS %) |
| `src/components/kds/TimeHeader.tsx` | 24h time ruler |
| `src/components/kds/EquipmentFilter.tsx` | Category pill filter |
| `src/components/kds/TaskExecutionCard.tsx` | Cook card: Start/Timer/Complete + batch entry on Complete |
| `src/components/kds/DeviationBadge.tsx` | Variance badge (<=5% ok, 5-10% warn, >10% alert) |
| `src/components/kds/BOMSnapshotPanel.tsx` | Modal: frozen BOM ingredients |

## Patterns & Gotchas
- Gantt bars positioned via CSS % within 24h range
- BOM snapshot frozen at task start (JSONB) — immutable once captured
- Batch entry integrated into CookStation (Phase 3.5)
- DeviationBadge computed client-side: `((actual/expected)-1)*100`

→ Schema: `02_Obsidian_Vault/Database Schema.md`
→ Architecture: `02_Obsidian_Vault/Shishka OS Architecture.md`
→ Phase history: `docs/context/phases/phase-2-kds.md`
