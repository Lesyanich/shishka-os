# Admin Panel — Current State

**Last updated:** 2026-04-05
**Active phase:** Kitchen UX v2 — Phase A Foundation
**Branch:** `feature/admin/kitchen-ux-v2-phase-a`
**Dev server:** `apps/admin-panel/` (port 5173)

## Primer
<!-- AUTO-REWRITTEN by Claude at session end. Do not edit manually. -->
- **Session date:** 2026-04-05
- **Last completed:** Kitchen UX v2 Phase A — Foundation. New pages: Dashboard (/dashboard), MyTasks (/tasks), KitchenLive (/live), CookLogin (/cook-login). /kitchen redirects to /dashboard. Cook PIN login with staff list + 4-digit numpad. MyTasks: step-by-step recipe execution, weight input, photo capture (compressed 1200px JPEG), Label Info screen with batch_code for handwriting on bags. Schedule: added 6/1 template + custom work/off pattern builder. KitchenNav role-based (manager sees all 5 pages, cook sees 2). Migration 096: assigned_to/actual_temperature/notes on production_tasks, preferred_language/skill_level on staff, shelf_life_days on nomenclature, min_skill_level on recipes_flow, batch_code/produced_by/photo_url/photo_skipped_reason on inventory_batches, cook_feedback table, fn_generate_batch_code function, batch_status enum extended.
- **Next step:** 1) Apply migration 096. 2) Create batch-photos Storage bucket in Supabase. 3) Test cook login + task execution + photo + label flow. 4) Phase B: Planner enhancements (working hours, staff assignment).
- **Blockers:** Migration 096 not yet applied. batch-photos storage bucket not yet created.
- **Modified files:** src/App.tsx, src/pages/Dashboard.tsx (new), src/pages/MyTasks.tsx (new), src/pages/CookLogin.tsx (new), src/pages/KitchenLive.tsx (new), src/components/KitchenNav.tsx, src/components/schedule/BulkScheduleGenerator.tsx, services/supabase/migrations/096_kitchen_ux_v2_foundation.sql (new)

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
