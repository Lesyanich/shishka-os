# Admin Panel — Current State

**Last updated:** 2026-04-05
**Active phase:** Kitchen UX v2 — Phase A Foundation
**Branch:** `feature/admin/kitchen-ux-v2-phase-a`
**Dev server:** `apps/admin-panel/` (port 5173)

## Primer
<!-- AUTO-REWRITTEN by Claude at session end. Do not edit manually. -->
- **Session date:** 2026-04-06
- **Last completed:** Kitchen UX v2 Phase A+B. Phase A: Dashboard, MyTasks (photo+label), CookLogin (PIN), KitchenLive, Schedule 6/1+custom, migration 096. Phase B: BackwardScheduler enhanced with configurable shift start + working hours warning, batch multiplier (x1/x2/x3) in DishSelector, skill-based staff assignment with auto-suggest and color-coded match indicators (green/yellow/red), save with assigned_to. backwardSchedule.ts extended with ScheduleResult type and shift constraint validation.
- **Next step:** 1) Create batch-photos Storage bucket in Supabase. 2) Test planner: deadline → dishes → calculate → assign staff → confirm plan. 3) Phase C: Cook Feedback (voice input, FAB button).
- **Blockers:** batch-photos storage bucket not yet created.
- **Modified files:** (Phase B) src/components/planner/BackwardScheduler.tsx, src/components/planner/DishSelector.tsx, src/lib/backwardSchedule.ts

## Tech Stack

React 19 + Vite 7 + Tailwind v4 + Supabase + TypeScript strict mode.
Error monitoring: Sentry (`@sentry/react`) — ErrorBoundary + browserTracing + replay. Source maps: `hidden`.
Auth: Supabase Auth (email/password). `persistSession: true`. ProtectedRoute + AuthProvider.
PWA: manifest.json + meta tags (no Service Worker yet).

## Phase Roadmap

### Phase 11-16: Procurement & Receiving (DONE)

| Phase | Name | Status |
|-------|------|--------|
| 11 | Procurement Foundation (DB Schema) | **DONE** (060-063) |
| 12 | Procurement RPCs | **DONE** (064-065) |
| 13 | Receiving Station (Frontend) | **DONE** |
| 14 | Purchase Order Management | **DONE** |
| 15 | Financial Reconciliation | **DONE** |
| 16 | MRP -> PO Integration | **DONE** |

### Phase 17-20: Syrve Integration

| Phase | Name | Status |
|-------|------|--------|
| 17 | Syrve Foundation — Nomenclature Mapping | **IN PROGRESS** |
| 18 | Purchase Push — Закупки -> Syrve | planned |
| 19 | Sales Pull — Продажи из Syrve | planned |
| 20 | Waste Push + Analytics Comparison | planned |

-> Integration plan: `.claude/plans/declarative-napping-chipmunk.md`

### Staff Schedule & Kitchen Dashboard (DONE — frontend, migration pending)

New modules added in session 2026-03-21:
- **Migration 069:** `staff`, `shifts`, `shift_tasks`, `equipment_slots` tables (pending apply)
- **Kitchen Dashboard:** `/kitchen` — open access, no auth, mobile-first coordinator dashboard
- **Schedule Manager:** `/schedule` — protected, CRUD for staff/shifts/tasks, weekly calendar, bulk generation
- **Backward Scheduler:** `/planner/batch` — deadline-based reverse scheduling with Gantt + conflict detection
- **PWA:** manifest.json, meta tags, QR code generation for `/kitchen`
- **Integration stubs:** `src/lib/printing.ts` (PrintService), `src/lib/scanner.ts` (ScannerService)

## Recent Fix: Receipt Job Resilience (2026-03-14)

**Problem:** Google Drive file sync causes HMR reloads, destroying in-flight async state.

**Solution — 3-layer resilience in FinanceManager.tsx:**
1. Module-level resolver outside React lifecycle (survives HMR)
2. sessionStorage persistence for pendingJobId, imageUrls, stagingData
3. Custom event bridge (`receipt-job-resolved`) + fallback poll every 10s

## Routing (Frontend)

| Route | Component | Status |
|---|---|---|
| `/login` | LoginPage.tsx | public |
| `/cook-login` | CookLogin.tsx | **public (PIN auth)** |
| `/kitchen` | → redirect to /dashboard | legacy redirect |
| `/dashboard` | Dashboard.tsx | **public (no auth)** |
| `/tasks` | MyTasks.tsx | **public (cook session)** |
| `/live` | KitchenLive.tsx | **public (no auth)** |
| `/` | ControlCenter.tsx | protected |
| `/bom` | BOMHub.tsx | protected |
| `/kds` | KDSBoard.tsx | protected |
| `/cook` | CookStation.tsx | protected (legacy) |
| `/waste` | WasteTracker.tsx | protected |
| `/logistics` | LogisticsScanner.tsx | protected |
| `/procurement` | Procurement.tsx | protected |
| `/sku` | SkuManagerPage.tsx | protected |
| `/orders` | OrderManager.tsx | protected |
| `/planner` | MasterPlanner.tsx | protected |
| `/planner/batch` | BatchPlanner.tsx | protected |
| `/finance` | FinanceManager.tsx | protected |
| `/receive` | ReceivingStation.tsx | protected |
| `/production` | ProductionOrdersPage.tsx | protected |
| `/schedule` | ScheduleManager.tsx | protected |
| `/settings` | Settings.tsx | protected |

## New Hooks (2026-03-21)

| Hook | Table | Realtime |
|---|---|---|
| `useStaff` | staff | no |
| `useShifts` | shifts | yes |
| `useShiftTasks` | shift_tasks | no |
| `useEquipmentSlots` | equipment_slots | yes |
| `useKitchenDashboard` | shifts + shift_tasks + equipment_slots | yes (all 3) |
| `useRecipeSteps` | recipes_flow | no |
| `useProductionOrders` | production_orders | yes |

## New Components (2026-03-21)

| Component | Location |
|---|---|
| ActiveShifts, ActiveTasks, EquipmentTimeline, UpcomingTasks | `kitchen-dashboard/` |
| StaffList, StaffForm, KitchenQR | `schedule/` |
| WeekCalendar, ShiftEditor, ShiftTaskEditor | `schedule/` |
| EquipmentAllocation, BulkScheduleGenerator | `schedule/` |
| BackwardScheduler, BackwardGantt, DishSelector, ConflictBadge | `planner/` |

## New Libs (2026-03-21)

| File | Purpose |
|---|---|
| `src/lib/backwardSchedule.ts` | Backward scheduling algorithm + conflict detection |
| `src/lib/printing.ts` | PrintService interface + stub (future: XP-365B printer) |
| `src/lib/scanner.ts` | ScannerService interface + stub (future: camera barcode) |

## Migrations Applied

70 total (001-069). Latest:
- 060-063: Procurement ENUMs + PO tables + receiving tables + links
- 064-065: Procurement RPCs + fn_approve_receipt v11
- 066: Syrve Integration (syrve_config, syrve_sync_queue, syrve_sync_log, syrve_uom_map, syrve_sales)
- 067/067a: DB Normalization & Seed Data (tag_groups, tags, nutrition, fin_sub_categories, nomenclature_tags)
- 068: Data Quality (UoM lowercase, name_th NOT NULL, nutrition gaps, wht_percent on fin_categories/fin_sub_categories)
- 069: Staff Schedule (staff, shifts, shift_tasks, equipment_slots + RLS + Realtime) — **applied**
- 070: Equipment Enrichment (capacity, setup_time_min, category, status) — **applied**
- 073: Chicken Grill recipe flow seed (superseded by 074) — **skip**
- 074: recipes_flow v2 (CREATE TABLE + enriched schema + 9-step chicken grill seed) — **applied**
- 075: production_orders (CREATE TABLE + auto order_number + RLS + Realtime) — **applied**
- 076: equipment_slots enrichment (production_order_id, recipe_step_id, status + equipment capacity seed) — **applied**
- 077: ~~DELETED~~ — MCP agent updated directly instead of DB compatibility hacks

-> Full table/RPC reference: `docs/domain/db-schema-summary.md`
-> Full schema with erDiagram: `vault/Architecture/Database Schema.md`

## Auth & Security (Phase 8)

- Supabase Auth (email/password), AuthProvider -> ProtectedRoute -> AppShell
- RLS: ALL tables `auth_full_access` via `fn_is_authenticated()`
- staff/shifts/shift_tasks/equipment_slots: anon SELECT (for /kitchen) + authenticated ALL
- SECURITY DEFINER RPCs bypass RLS by design
- `created_by` auto-filled via trigger on expense_ledger

## 3-Tier Product Architecture (Phase 10)

-> See `docs/domain/supplier-domain.md` for full model.

-> Module docs: `docs/projects/admin/modules/`
-> Architecture: `vault/Architecture/`
