# Admin Panel — Current State

**Last updated:** 2026-03-15
**Active phase:** Phase 17 — Syrve Integration Foundation (in progress)
**Branch:** `feature/phase-6-mapping-engine`
**Dev server:** `03_Development/admin-panel/` (port 5173)

## WIP (Work in Progress)
<!-- Managed by agent during context switches -->
- **Task:** Phase 17 — Syrve Nomenclature Mapping
- **Branch:** feature/phase-6-mapping-engine
- **Next step:** Continue Syrve mapping UI in Settings
- **Blocked by:** —

## Tech Stack

React 19 + Vite 7 + Tailwind v4 + Supabase + TypeScript strict mode.
Error monitoring: Sentry (`@sentry/react`) — ErrorBoundary + browserTracing + replay. Source maps: `hidden`.
Auth: Supabase Auth (email/password). `persistSession: true`. ProtectedRoute + AuthProvider.

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
| `/` | ControlCenter.tsx | protected |
| `/bom` | BOMHub.tsx | protected |
| `/kds` | KDSBoard.tsx | protected |
| `/cook` | CookStation.tsx | protected |
| `/waste` | WasteTracker.tsx | protected |
| `/logistics` | LogisticsScanner.tsx | protected |
| `/procurement` | Procurement.tsx | protected |
| `/sku` | SkuManagerPage.tsx | protected |
| `/orders` | OrderManager.tsx | protected |
| `/planner` | MasterPlanner.tsx | protected |
| `/receive` | ReceivingStation.tsx | protected |
| `/finance` | FinanceManager.tsx | protected |
| `/settings` | Settings.tsx | protected |

## Migrations Applied

69 total (001-068). Latest:
- 060-063: Procurement ENUMs + PO tables + receiving tables + links
- 064-065: Procurement RPCs + fn_approve_receipt v11
- 066: Syrve Integration (syrve_config, syrve_sync_queue, syrve_sync_log, syrve_uom_map, syrve_sales)
- 067/067a: DB Normalization & Seed Data (tag_groups, tags, nutrition, fin_sub_categories, nomenclature_tags)
- 068: Data Quality (UoM lowercase, name_th NOT NULL, nutrition gaps, wht_percent on fin_categories/fin_sub_categories)

-> Full table/RPC reference: `docs/context/shared/db-schema-summary.md`
-> Full schema with erDiagram: `02_Obsidian_Vault/Architecture/Database Schema.md`

## Auth & Security (Phase 8)

- Supabase Auth (email/password), AuthProvider -> ProtectedRoute -> AppShell
- RLS: ALL tables `auth_full_access` via `fn_is_authenticated()`
- SECURITY DEFINER RPCs bypass RLS by design
- `created_by` auto-filled via trigger on expense_ledger

## 3-Tier Product Architecture (Phase 10)

-> See `docs/context/shared/supplier-domain.md` for full model.

-> Module docs: `docs/context/projects/admin/modules/`
-> Architecture: `02_Obsidian_Vault/Architecture/`
