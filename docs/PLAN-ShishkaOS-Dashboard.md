# Shishka OS — Frontend Architecture Blueprint
**Version:** 0.5.0 | **Phase:** 5 (Control Center + BOM Hub)
**Last Updated:** 2026-03-08
**Tech Stack:** React 19 + Vite 7 + Tailwind v4 + Supabase (PostgreSQL 17.6)
**UX Benchmarks:** Apicbase · Galley Solutions · Toast (data-heavy, clean B2B SaaS)

---

## Vision: The 7-Pillar ERP

Shishka OS is a Unified ERP/KDS PWA (PC + mobile). One app, one Supabase as SSoT.
Future: headless architecture → same DB powers client site + marketing tools.

| Pillar | Module | Page | Status |
|--------|--------|------|--------|
| 0 | CEO Control Center | `/` | ✅ Phase 1 COMPLETE (2026-03-08) |
| 1 | Omni-Menu, BOM & Health Matrix | `/bom` | ✅ Phase 1 COMPLETE (2026-03-08) |
| 2 | Smart Kitchen & KDS | `/kds` + `/cook` | ✅ Phase 2 COMPLETE (2026-03-09) |
| 3 | Smart Waste & Procurement | `/waste` | ✅ Phase 3 COMPLETE (2026-03-09) |
| 3.5 | Batch Tracking & Logistics | `/logistics` | 🔨 Phase 3.5 IN PROGRESS |
| 4 | Financial Engine (CapEx/OpEx/HR) | `/finance` | 🔜 Phase 4 |
| 5 | Advanced Analytics & Food Cost | `/analytics` | 🔜 Phase 5 |
| 6 | Executive Hub (Tasks/Purchases/Ideas) | `/tasks` | 🔜 Phase 6 |
| — | SYRVE Seamless Sync | background | 🔮 Future |

---

## Full Component Tree

```
admin-panel/src/
│
├── App.tsx                         # BrowserRouter + Routes (deep-link ready)
│
├── layouts/
│   └── AppShell.tsx                # Sidebar (icons+labels) + TopBar + <Outlet>
│
├── pages/
│   ├── ControlCenter.tsx           # PILLAR 0: CEO Dashboard ✅
│   ├── BOMHub.tsx                  # PILLAR 1: Menu + BOM Builder ✅
│   ├── KDSBoard.tsx                # PILLAR 2: CEO Gantt scheduling ✅
│   ├── CookStation.tsx             # PILLAR 2: Mobile-first cook UI ✅ (modified: batch entry)
│   ├── WasteTracker.tsx            # PILLAR 3: Waste Log ✅
│   ├── LogisticsScanner.tsx        # PILLAR 3.5: Batch Transfer + Unpack ✅
│   ├── FinancialEngine.tsx         # PILLAR 4: CapEx/OpEx/HR (Phase 4)
│   ├── ExecutiveHub.tsx            # PILLAR 6: CEO Task Kanban (Phase 6)
│   └── Analytics.tsx               # PILLAR 5: Food Cost + Menu Engineering (Phase 5)
│
├── components/
│   │
│   ├── control-center/
│   │   ├── HeroKPIRow.tsx          # 4 stat cards (tasks, capex, equipment, BOM%)
│   │   ├── KitchenStatusKanban.tsx # PRIMARY: 3-col Kanban from production_tasks
│   │   ├── CapExMiniChart.tsx      # BarChart: CapEx spend by fin_category (recharts)
│   │   ├── EquipmentAlerts.tsx     # Top-N equipment overdue for service
│   │   └── BOMHealthBar.tsx        # BOM coverage % + missing dishes list
│   │
│   ├── bom-hub/                    # (Phase 1 — wraps existing RecipeBuilder)
│   │   ├── BOMEditor.tsx           # Refactored RecipeBuilder
│   │   ├── NutritionCascade.tsx    # (Phase 2) Auto-calc БЖУ/ккал/аллергены
│   │   └── BOMVisualTree.tsx       # (Phase 2) RAW→PF→MOD→SALE visual tree
│   │
│   ├── kds/                        # Phase 2 ✅ COMPLETE
│   │   ├── GanttTimeline.tsx       # Gantt container: conflict banner + equipment rows
│   │   ├── GanttRow.tsx            # Equipment row: label + task bars
│   │   ├── GanttTaskBar.tsx        # Positioned task bar (CSS %, status colors)
│   │   ├── TimeHeader.tsx          # 24h time ruler
│   │   ├── EquipmentFilter.tsx     # Category pill filter
│   │   ├── TaskExecutionCard.tsx   # Cook card: Start/Timer/Batch Complete + barcode display ✅
│   │   ├── DeviationBadge.tsx      # Variance badge (≤5% ok / 5-10% warn / >10% alert)
│   │   └── BOMSnapshotPanel.tsx    # Modal: frozen BOM ingredients at task start
│   │
│   ├── waste/                      # Phase 3 ✅ COMPLETE
│   │   ├── ZeroDayStocktake.tsx    # Inline-edit inventory table + search + Save
│   │   ├── WasteLogForm.tsx        # Waste log form + financial liability + recent logs
│   │   └── PredictivePO.tsx        # Plan selector + Generate PO → shortage table
│   │
│   ├── logistics/                  # Phase 3.5 ✅ COMPLETE
│   │   ├── TransferTab.tsx         # Barcode scan → Kitchen→Assembly transfer
│   │   └── UnpackTab.tsx           # Barcode scan → open batch → countdown timer
│   │
│   ├── finance/                    # Phase 4
│   │   ├── TransactionsTable.tsx   # capex_transactions full CRUD
│   │   ├── CapExByCategory.tsx     # Full charts by fin_categories
│   │   └── ShiftCalendar.tsx       # HR shifts (new table needed)
│   │
│   └── analytics/                  # Phase 5
│       ├── MenuEngineeringMatrix.tsx # Profitability × Popularity 2×2
│       ├── FoodCostDynamic.tsx     # Real-time food cost with waste factor
│       └── DateRangePicker.tsx     # Global date filter
│
└── hooks/
    ├── useKitchenTasks.ts           # production_tasks CRUD + grouping by status
    ├── useCapEx.ts                  # capex_transactions + fin_categories join
    ├── useEquipment.ts              # equipment + service alert logic (>90 days)
    ├── useBOMCoverage.ts            # nomenclature SALE% vs bom_structures coverage
    ├── useGanttTasks.ts             # Gantt tasks + conflict detection + Realtime ✅
    ├── useEquipmentCategories.ts    # Equipment list + category filter ✅
    ├── useCookTasks.ts              # Cook tasks + RPC start + complete + Realtime ✅
    ├── useInventory.ts              # Two-query: nomenclature + inventory_balances ✅
    ├── useWasteLog.ts               # Waste logs + createWaste + auto-deduct ✅
    ├── usePredictivePO.ts           # RPC fn_predictive_procurement ✅
    ├── useBatches.ts                # Batches + createBatchesFromTask + openBatch ✅
    ├── useLocations.ts              # Locations list ✅
    └── useStockTransfer.ts          # Transfer batch by barcode ✅
```

---

## Data → Widget Mapping

| Widget | Table(s) | Key Query |
|--------|----------|-----------|
| HeroKPIRow — Tasks | `production_tasks` | `GROUP BY status` |
| HeroKPIRow — CapEx | `capex_transactions` | `SUM(amount_thb)` current month |
| HeroKPIRow — Equipment | `equipment` | `COUNT(*)` |
| HeroKPIRow — BOM% | `nomenclature` + `bom_structures` | SALE covered / total |
| KitchenStatusKanban | `production_tasks` | `ORDER BY updated_at DESC` |
| CapExMiniChart | `capex_transactions` + `fin_categories` | `SUM GROUP BY category` |
| EquipmentAlerts | `equipment` | `ORDER BY last_service_date ASC NULLS FIRST` |
| BOMHealthBar | `nomenclature` + `bom_structures` | SALE items missing BOM |

---

## Pillar 1: BOM & Health Matrix (Roadmap)

### Phase 1 (COMPLETE — 2026-03-08)
- Full CRUD for `nomenclature` via RecipeBuilder (search, filter, select)
- Visual BOM builder for `bom_structures` (RAW→PF→MOD→SALE)
- Wrapped in `BOMHub.tsx` page at route `/bom`

### Phase 2 Extensions
- **NutritionCascade:** Add fields to `nomenclature` — `calories`, `protein`, `fat`, `carbs`, `allergens[]`
  - New migration: `016_nutrition_fields.sql`
  - Auto-cascade: When saving BOM, recalculate parent nutrition from children × qty
- **BOM Visual Tree:** D3.js or react-flow tree visualization (RAW→PF→MOD→SALE)

---

## Pillar 2: Smart Kitchen & KDS — ✅ COMPLETE (2026-03-09)

### Migration 016
- Added 6 columns to `production_tasks`: `scheduled_start`, `duration_min`, `equipment_id FK`, `theoretical_yield`, `actual_weight`, `theoretical_bom_snapshot JSONB`
- Created RPC `fn_start_production_task(UUID)`: sets status + actual_start + freezes BOM snapshot
- Enabled Supabase Realtime for `production_tasks`
- Indexes: `idx_pt_equipment_scheduled` (composite), `idx_pt_status`

### CEO Gantt (`/kds`)
- 24h X-axis (TimeHeader), equipment Y-axis filtered by category (EquipmentFilter)
- CSS percentage positioning: `left=(startMin/1440)*100%`, `width=(durationMin/1440)*100%`
- Conflict detection: O(n²) per equipment group, sorted by start time
- Conflict banner with count + rose ring on overlapping bars

### Cook Station (`/cook`)
- Mobile-first (max-w-lg), iPad-optimized large touch targets (py-3 buttons)
- Start → calls RPC `fn_start_production_task` → timer starts (setInterval)
- Complete → modal for `actual_weight` input → Supabase UPDATE
- DeviationBadge: ≤5% emerald, 5-10% amber, >10% rose
- BOMSnapshotPanel: shows frozen BOM ingredients

### Actual vs Theoretical (implemented)
- Time variance: `((elapsed_min / duration_min) - 1) * 100%` — live during execution
- Weight variance: `((actual_weight / theoretical_yield) - 1) * 100%` — shown in complete modal
- Thresholds: ≤5% OK, 5-10% Warning, >10% Alert

---

## Pillar 3: Smart Waste & Inventory — ✅ COMPLETE (2026-03-09)

### Migration 017
- Custom ENUMs: `waste_reason` (expiration, spillage_damage, quality_reject, rd_testing), `financial_liability` (cafe, employee, supplier)
- `inventory_balances` table: PK=nomenclature_id FK, quantity, last_counted_at — UPSERT on stocktake
- `waste_logs` table: UUID PK, nomenclature_id FK, quantity, reason, financial_liability, comment, CHECK constraint (comment required when liability != cafe)
- RPC `fn_predictive_procurement(UUID)`: Recursive CTE walks BOM tree to leaf RAW ingredients, compares vs inventory, returns shortage array sorted by shortage DESC
- RLS: anon=full CRUD, authenticated=SELECT
- Realtime: both tables in `supabase_realtime`

### Zero-Day Stocktake (`ZeroDayStocktake.tsx`)
- Inline-edit inventory table with search filter and per-row Save button
- UPSERT to `inventory_balances` with `last_counted_at=now()`
- Shows item name, product_code, unit, editable quantity, last count date

### Waste Logging with Financial Liability (`WasteLogForm.tsx`)
- Form: item select, quantity, reason dropdown, financial liability toggle (color-coded: emerald/amber/rose)
- Comment field required when liability is employee or supplier (validated in UI + DB CHECK constraint)
- Recent write-offs table below form with liability badges

### Predictive Procurement (`PredictivePO.tsx`)
- Plan selector dropdown (fetches last 20 from `daily_plan`)
- Generate PO button → calls RPC → recursive BOM walk → shortage table
- Results: Ingredient | Needed | On Hand | To Purchase (shortage > 0 in rose, OK in emerald)

### Data Flow
| Widget | Tables | Query |
|--------|--------|-------|
| ZeroDayStocktake | `nomenclature` + `inventory_balances` | Two queries, JS join, UPSERT |
| WasteLogForm | `waste_logs` + `nomenclature` + `inventory_balances` | INSERT + deduct balance |
| PredictivePO | `daily_plan` + RPC `fn_predictive_procurement` | Recursive CTE → shortage array |

---

## Pillar 4: Financial Engine (Phase 4 Roadmap)

### CapEx Dashboard (Full)
- Full drill-down into `capex_transactions` + `capex_assets`
- Depreciation calculator using `useful_life_months` from `capex_assets`
- OpEx tracking (ongoing repairs, consumables)

### HR/Shifts (New)
```sql
CREATE TABLE shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_name TEXT NOT NULL,
  role TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  rate_per_hour NUMERIC,
  notes TEXT
);
```

---

## Pillar 5: Analytics & Food Cost (Phase 5 Roadmap)

### Menu Engineering Matrix
- 4 quadrants: Stars (high profit + high popularity), Plowhorses, Puzzles, Dogs
- Data: sales data from SYRVE sync + `bom_structures` cost calculation
- Color-coded interactive scatter plot

### Dynamic Food Cost
- Base: `bom_structures.quantity_per_unit × ingredient_cost`
- Adjustment: waste factor from `waste_log`
- Target: <30% food cost ratio

---

## Pillar 6: Executive Hub (Phase 6 Roadmap)

**Route:** `/tasks` — Kanban Board for CEO and partners.

### New Table
```sql
CREATE TABLE executive_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('todo', 'purchase', 'idea')),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog', 'in_progress', 'done')),
  assignee_id UUID,
  priority INTEGER DEFAULT 0,
  due_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Features
- **Kanban Board** (`/tasks`): 3-column board (Backlog / In Progress / Done), filterable by type (todo/purchase/idea)
- **Quick Capture Widget**: Compact "Add Task" form embedded in CEO Control Center (`/`) for rapid task entry without leaving the dashboard
- **Purchase List**: Filtered view of `type='purchase'` tasks — CEO-driven procurement list separate from predictive PO
- **Idea Backlog**: Strategic ideas (type='idea') with priority ranking for future sprint planning

### Security (P0)
- **Strict RLS:** Only users with `app.is_admin = 'true'` can SELECT/INSERT/UPDATE/DELETE on `executive_tasks`
- Kitchen line staff (cooks, assemblers) must NOT have visibility into executive tasks
- Separate from `production_tasks` (operational) — this table is for management only

### Data Flow
| Widget | Table | Query |
|--------|-------|-------|
| KanbanBoard | `executive_tasks` | `GROUP BY status, ORDER BY priority DESC` |
| QuickCapture | `executive_tasks` | `INSERT` with type selector |
| PurchaseList | `executive_tasks` | `WHERE type = 'purchase'` |
| IdeaBacklog | `executive_tasks` | `WHERE type = 'idea' ORDER BY priority DESC` |

---

## SYRVE Integration (Future)

- Webhook: SYRVE → Supabase Edge Function → update `nomenclature`
- Bidirectional: Changes in Shishka OS push to SYRVE via SYRVE API
- Zero double-entry for kitchen staff
- Table: `nomenclature.syrve_id UUID UNIQUE` already in place for mapping

---

## POS Minimization Strategy (The "Dumb POS" Architecture)

**Status:** P0 ARCHITECTURAL RULE — applies to all future phases and integrations.

Shishka OS follows the "Dumb POS" strategy: the POS system (SYRVE) is deliberately reduced to a thin fiscal gateway, while 100% of kitchen intelligence, inventory, analytics, and HR lives inside Shishka OS (Supabase). This eliminates dependency on expensive POS add-on modules and makes multi-location scaling cost-efficient.

### Rule 1: SYRVE as a Fiscal Gateway

SYRVE is used ONLY for:
- Printing fiscal receipts (cash register compliance)
- Acquiring card payments (terminal integration)
- Front-of-House order entry (waiter → kitchen ticket)

SYRVE is NOT used for kitchen management, inventory tracking, analytics, or any back-of-house logic. All of that is Shishka OS territory.

### Rule 2: Zero POS Add-ons

We do NOT use and do NOT plan to integrate any paid SYRVE modules:
- **No SYRVE KDS** → replaced by Shishka OS `/kds` + `/cook` (Phase 2)
- **No SYRVE Advanced Inventory** → replaced by Shishka OS Smart Waste & Procurement (Phase 3)
- **No SYRVE HR** → replaced by Shishka OS Financial Engine shifts (Phase 4)
- **No SYRVE Analytics** → replaced by Shishka OS Advanced Analytics (Phase 5)

All kitchen intelligence is built in-house at 100% ownership — no vendor lock-in, no per-location licensing costs for modules we already have.

### Rule 3: Data Flow (Sales → BOM Depletion)

When a dish (SALE) is sold in SYRVE:

```
SYRVE Sale Event
  → Webhook → Supabase Edge Function
    → Shishka OS reads SALE product_code
      → Resolves BOM tree (SALE → MOD → PF → RAW) via bom_structures
        → Depletes internal inventory (Supabase tables)
```

Key principle: Shishka OS "unrolls" the BOM itself and depletes stock internally. We NEVER rely on SYRVE's inventory engine for stock tracking. SYRVE only tells us "what was sold" — Shishka OS decides "what was consumed."

### Rule 4: Scale-Ready (Multi-Location)

When opening new locations:
- Purchase ONLY the cheapest base POS license (fiscal + payments + order entry), or only the functionality we cannot reliably and securely implement ourselves
- Connect it to the single Shishka OS "Brain" (Supabase)
- Zero additional per-location costs for KDS, Inventory, Analytics, or HR modules
- Each location is a `location_id` filter in the same database — one codebase, one deployment

**Cost formula per new location:** `Base POS license + iPad + Internet = done.`

---

## PWA Manifest (Future)

Add to `index.html`:
```html
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#020617">
```

`manifest.json`:
```json
{
  "name": "Shishka OS",
  "short_name": "ShishkaOS",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#020617",
  "theme_color": "#10b981"
}
```

---

## P0 Architecture Rules

1. **SSoT:** Supabase is the ONLY source of truth. UI reads/writes only through Supabase client.
2. **UUID everywhere:** All FK relationships use `id UUID`. No string codes in state.
3. **No schema edits in UI:** All DB changes via `03_Development/supabase/migrations/*.sql`
4. **Deep linking:** All pages have proper URL routes (`/`, `/bom`, `/kds`, etc.)
5. **Graceful degradation:** All widgets handle `isLoading`, `error`, and `empty data` states.
6. **Routing:** Always use `react-router-dom` BrowserRouter with `NavLink`/`useNavigate`. Never `useState` for page switching.
7. **recharts types:** Tooltip `formatter` params are untyped — use inferred types + `as` assertions, never explicit type annotations on params.

---

## Deployment Log

| Date | Phase | Agent | Summary |
|------|-------|-------|---------|
| 2026-03-08 | Phase 1 | Claude Sonnet 4.6 | Control Center (5 widgets) + BOM Hub + AppShell + 4 hooks. Build: 0 errors. |
| 2026-03-09 | Phase 2 | Claude Opus 4.6 | KDS Gantt (/kds) + Cook Station (/cook) + Migration 016 + RPC + Realtime + 3 hooks + 7 components. Build: 0 errors. |
| 2026-03-09 | Phase 3 | Claude Opus 4.6 | Waste (/waste) + Migration 017 (ENUMs + inventory_balances + waste_logs + fn_predictive_procurement) + 3 hooks + 3 components + 1 page. Build: 0 errors. |
| 2026-03-09 | Phase 3.5 | Claude Opus 4.6 | Batch Tracking (/logistics) + Migration 018 (locations + inventory_batches + stock_transfers + 4 RPCs) + Cook Station batch entry + 3 hooks + 2 components + 1 page. Build: 0 errors. |
