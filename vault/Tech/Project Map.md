---
title: Project Map
type: page
tags: [tech, map, overview, structure]
date: 2026-07-18
status: active
related:
  - "[[Tech/]]"
  - "[[Tech/Architecture]]"
  - "[[Tech/Stack]]"
  - "[[Tech/MCP Servers]]"
  - "[[Database/Schema]]"
---

# Project Map

> **The one-page "where does everything live" for Shishka OS.** Read this to get the whole shape of the system in one scroll. Deep detail lives in the linked pages — this map points, it doesn't duplicate.
>
> This page is **hybrid**: the prose is hand-written; the lists marked _(auto)_ are regenerated from the repo by `scripts/gen-project-map.mjs`, so they can't quietly go stale. (This replaced the old graphify graph — a 5,557-node picture nobody could read. See [[Tech/MCP Servers]] § retired.)

## The shape in one sentence

**Shishka Healthy Kitchen** (Rawai, Phuket) runs on a single Supabase database (the source of truth) that feeds an **admin panel** for the owner, syncs sales with **Loyverse** (POS), and is operated by a set of **AI agents** (chef, finance, procurement, …) coordinated through **Mission Control** tasks.

## Brains vs Hands

The repo splits into things that *think* and things that *do*:

| | Folders | What it is |
|---|---|---|
| **Brains** | `docs/`, `agents/`, `vault/`, `knowledge/` | Rules, agent prompts, knowledge base — the "why" and "how we decide" |
| **Hands** | `apps/`, `services/`, `tools/`, `scripts/`, `packages/` | The code that runs: admin UI, MCP servers, DB migrations, automation |
| **Config** | `.claude/`, `.secrets/`, `supabase/` | Claude Code setup, credentials (gitignored), Supabase CLI |

Full repo tree and stack versions: [[Tech/Stack]]. Architecture narrative: [[Tech/Architecture]].

## AI agents

Each agent is a **prompt** (its brain, in `agents/`) plus optionally an **MCP server** (its hands, in `services/`). You invoke one with its slash command (`/chef`, `/finance`, …) or just by describing the task. What each does and how they route lives in [[Tech/Agent System]].

<!-- AUTO:agents START -->
| Agent | Prompt dir | Identity |
|---|---|---|
| `/chef` | `agents/chef/` | Chef Agent — Shishka Healthy Kitchen |
| `/coo` | `agents/coo/` | COO Agent — DEPRECATED STUB |
| `/designer` | `agents/designer/` | (no AGENT.md) |
| `/finance` | `agents/finance/` | Finance Agent — Shishka Healthy Kitchen |
| `/lawyer` | `agents/lawyer/` | /lawyer — Legal Advisor Agent for Shishka Healthy Kitchen |
| `/procurement` | `agents/procurement/` | Procurement Analyst — Shishka Healthy Kitchen |
| `/strategy` | `agents/strategy/` | Strategic COO Agent — Shishka Healthy Kitchen |
| `/tech-lead` | `agents/tech-lead/` | Technical Tech-Lead Agent — Shishka Healthy Kitchen |
<!-- AUTO:agents END -->

### MCP servers (the agents' hands)

MCP = the tool layer agents call to read/write the system. Registered in `.mcp.json`; each reads its Supabase `service_role` from the macOS Keychain. Tool-by-tool detail: [[Tech/MCP Servers]].

<!-- AUTO:mcp START -->
- `shishka-chef` → `services/mcp-chef/`
- `shishka-finance` → `services/mcp-finance/`
- `shishka-mission-control` → `services/mcp-mission-control/`
<!-- AUTO:mcp END -->

## Admin panel — the pages you use

The owner UI (`apps/admin-panel/`, React + Vite → Vercel at shishka-os.vercel.app). Every screen is one lazily-loaded page component; the table below is **where each page's code lives** if you ever need to point an agent at it.

<!-- AUTO:pages START -->
| Page | Source file |
|---|---|
| `ApiCostPage` | `apps/admin-panel/src/pages/ApiCostPage.tsx` |
| `AttendancePage` | `apps/admin-panel/src/pages/hr/AttendancePage.tsx` |
| `BatchPlanner` | `apps/admin-panel/src/pages/BatchPlanner.tsx` |
| `BOMHub` | `apps/admin-panel/src/pages/BOMHub.tsx` |
| `BrainDriveMapPage` | `apps/admin-panel/src/pages/brain/BrainDriveMapPage.tsx` |
| `BrainPage` | `apps/admin-panel/src/pages/brain/BrainPage.tsx` |
| `BrainWikiPage` | `apps/admin-panel/src/pages/brain/BrainWikiPage.tsx` |
| `CashierPage` | `apps/admin-panel/src/pages/cashier/CashierPage.tsx` |
| `CookStation` | `apps/admin-panel/src/pages/CookStation.tsx` |
| `CookTasksPage` | `apps/admin-panel/src/pages/CookTasksPage.tsx` |
| `FinanceAnalytics` | `apps/admin-panel/src/pages/FinanceAnalytics.tsx` |
| `FinanceDashboard` | `apps/admin-panel/src/pages/FinanceDashboard.tsx` |
| `FinanceLayout` | `apps/admin-panel/src/pages/FinanceLayout.tsx` |
| `FinanceLedger` | `apps/admin-panel/src/pages/FinanceLedger.tsx` |
| `HandbookHome` | `apps/admin-panel/src/pages/handbook/HandbookHome.tsx` |
| `HandbookLayout` | `apps/admin-panel/src/pages/handbook/HandbookLayout.tsx` |
| `HandbookPage` | `apps/admin-panel/src/pages/handbook/HandbookPage.tsx` |
| `HRLayout` | `apps/admin-panel/src/pages/hr/HRLayout.tsx` |
| `KbEditor` | `apps/admin-panel/src/pages/handbook/KbEditor.tsx` |
| `KbRegistry` | `apps/admin-panel/src/pages/handbook/KbRegistry.tsx` |
| `KDSBoard` | `apps/admin-panel/src/pages/KDSBoard.tsx` |
| `KitchenLabels` | `apps/admin-panel/src/pages/KitchenLabels.tsx` |
| `KitchenRecipesPage` | `apps/admin-panel/src/pages/KitchenRecipesPage.tsx` |
| `MasterPlanner` | `apps/admin-panel/src/pages/MasterPlanner.tsx` |
| `MenuPage` | `apps/admin-panel/src/pages/menu/MenuPage.tsx` |
| `MissionControl` | `apps/admin-panel/src/pages/MissionControl.tsx` |
| `ModifiersPage` | `apps/admin-panel/src/pages/menu/ModifiersPage.tsx` |
| `PayrollPage` | `apps/admin-panel/src/pages/hr/PayrollPage.tsx` |
| `Procurement` | `apps/admin-panel/src/pages/Procurement.tsx` |
| `ProductionOrdersPage` | `apps/admin-panel/src/pages/ProductionOrdersPage.tsx` |
| `ProductionTargets` | `apps/admin-panel/src/pages/ProductionTargets.tsx` |
| `PunctualityPage` | `apps/admin-panel/src/pages/hr/PunctualityPage.tsx` |
| `ReceiptInbox` | `apps/admin-panel/src/pages/ReceiptInbox.tsx` |
| `ReceivingStation` | `apps/admin-panel/src/pages/ReceivingStation.tsx` |
| `SaladBarPage` | `apps/admin-panel/src/pages/SaladBarPage.tsx` |
| `SchedulePage` | `apps/admin-panel/src/pages/hr/SchedulePage.tsx` |
| `Settings` | `apps/admin-panel/src/pages/Settings.tsx` |
| `ShoppingList` | `apps/admin-panel/src/pages/ShoppingList.tsx` |
| `SkuManagerPage` | `apps/admin-panel/src/pages/SkuManagerPage.tsx` |
| `StaffPage` | `apps/admin-panel/src/pages/hr/StaffPage.tsx` |
| `StaffSchedulePage` | `apps/admin-panel/src/pages/staff/StaffSchedulePage.tsx` |
| `StaffTasksPage` | `apps/admin-panel/src/pages/StaffTasksPage.tsx` |
| `StationCountPage` | `apps/admin-panel/src/pages/StationCountPage.tsx` |
| `StocktakeReviewPage` | `apps/admin-panel/src/pages/StocktakeReviewPage.tsx` |
| `ThawStation` | `apps/admin-panel/src/pages/ThawStation.tsx` |
| `WasteTracker` | `apps/admin-panel/src/pages/WasteTracker.tsx` |
<!-- AUTO:pages END -->

### Routes (URL → area)

The address bar map, grouped by top-level area:

<!-- AUTO:routes START -->
- **/ (root)** — `/`
- **/api-costs** — `/api-costs`
- **/bom** — `/bom`
- **/brain** — `/brain`, `wiki/*`, `drive`
- **/cashier** — `/cashier`
- **/count** — `/count/session/:id`, `/count/:code`
- **/finance** — `/finance`, `dashboard`, `ledger`, `analytics`
- **/handbook** — `/handbook`, `:slug`, `registry`, `new`, `:slug/edit`, `*`
- **/hr** — `/hr`, `attendance`, `punctuality`, `payroll`, `staff`
- **/kitchen** — `/kitchen/waste`, `/kitchen/schedule`, `/kitchen/tasks`, `/kitchen/my-tasks`, `/kitchen/labels`, `/kitchen/recipes`
- **/login** — `/login`
- **/menu** — `/menu/modifiers`, `/menu/*`
- **/mission** — `/mission`
- **/nomenclature** — `/nomenclature/:productCode`, `/nomenclature`
- **/planner** — `/planner`, `/planner/batch`
- **/procurement** — `/procurement`
- **/production** — `/production`
- **/receipts** — `/receipts`
- **/receive** — `/receive`
- **/salad-bar** — `/salad-bar`
- **/schedule** — `/schedule`
- **/settings** — `/settings`
- **/shopping-list** — `/shopping-list`
- **/sku** — `/sku`
- **/staff** — `/staff/schedule`
- **/staff-tasks** — `/staff-tasks`
- **/stock** — `/stock`
- **/targets** — `/targets`
- **/thaw** — `/thaw`
<!-- AUTO:routes END -->

## Database

Supabase Postgres is the **single source of truth** — everything else (admin, Loyverse, agents) is a mirror or a writer. The data is organised by business domain:

| Domain | What lives here | Deep doc |
|---|---|---|
| **Menu / BOM** | `nomenclature`, BOM lines, modifiers, prices — the Lego chain RAW → PF → MOD → SALE | [[Database/Schema]], [[Menu/]] |
| **Finance** | receipts inbox, `expense_ledger`, `purchase_logs`, WAC, CapEx | [[Database/Schema]], [[Finance/]] |
| **Procurement / stock** | suppliers, catalogs, price book, stations, stocktakes | [[Procurement/]] |
| **HR / attendance** | staff, `attendance_log`, payroll, punctuality | [[Database/Schema]] |
| **Mission Control** | `business_tasks`, comments, sprints, initiatives | [[Tech/Agent System]] |
| **Access / RLS** | auth, roles, row-level security | [[Database/RLS Policies]] |

<!-- AUTO:tables START -->
[[Database/Schema]]'s Tables Index documents **45 core tables** — a curated subset, not the full live schema (the live DB carries more). Full schema, RLS and RPCs live in the [[Database/]] folder; this map does not duplicate them.
<!-- AUTO:tables END -->

Contracts, migrations and RPCs: [[Database/Domain Contracts]] · [[Database/Migrations]] · [[Database/RPC Catalog]].

## Where do I find X?

| I want to… | Go to |
|---|---|
| The immutable rules / how agents behave | `docs/constitution/operational-rules.md` |
| Current state + active tasks | `STATUS.md` (auto-generated), Mission Control |
| A business domain's context | `docs/business/domains/<domain>.md` |
| The brand design system | separate repo **shishka-health** → `design-system/` |
| How the DB is shaped | [[Database/Schema]] |
| What a specific page's code is | the _Admin panel pages_ table above |
| A past decision & why | [[Decisions/]] · `docs/plans/spec-*.md` |
| Deploy topology | `docs/operations/deploy-map.md` |

## Navigating the code (for agents)

There is **no knowledge-graph shortcut** — use **grep + targeted `Read`** (or the `Explore` agent when scope is uncertain). This map + the linked deep docs are the human-readable index; grep is the precise search.

---
<!-- AUTO:stamp START -->
_Auto sections regenerated from the repo at commit `3421547e`. Re-run: `node scripts/gen-project-map.mjs`._
<!-- AUTO:stamp END -->
