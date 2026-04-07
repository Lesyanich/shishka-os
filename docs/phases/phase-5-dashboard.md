# Phase 5: Control Center, Orders & MRP

**Date:** 2026-03-08 – 2026-03-10
**Status:** COMPLETED
**Covers:** Phase 5 (Dashboard) + Phase 5.1 (Orders) + Phase 5.2 (MRP) + Phase 5.3 (Knowledge Base) + Phase 5.4 (Agent Skills)

## Phase 5: Control Center & BOM Hub (Frontend)

### New Dependencies
- `react-router-dom` — deep linking, BrowserRouter
- `recharts` — BarChart for CapEx analytics

### Dashboard Widgets (ControlCenter.tsx)
| Widget | Tables | Query |
|---|---|---|
| HeroKPIRow (Tasks) | production_tasks | GROUP BY status |
| HeroKPIRow (CapEx) | capex_transactions | SUM(amount_thb) current month |
| HeroKPIRow (Equipment) | equipment | COUNT(*) |
| HeroKPIRow (BOM%) | nomenclature + bom_structures | SALE covered / total |
| KitchenStatusKanban | production_tasks | ORDER BY updated_at DESC |
| CapExMiniChart | capex_transactions + fin_categories | SUM GROUP BY category (2 queries, JS join) |
| EquipmentAlerts | equipment | ORDER BY last_service_date ASC NULLS FIRST |
| BOMHealthBar | nomenclature + bom_structures | SALE items without BOM |

## Phase 5.1: Orders Pipeline & Webhook Receiver

### Migration 022: Orders Pipeline
- `order_source` ENUM: website, syrve, manual
- `order_status` ENUM: new, preparing, ready, delivered, cancelled
- `orders` + `order_items` tables
- `production_tasks.order_id` FK added
- `fn_process_new_order(UUID)` — BOM explosion: loops SALE items → creates production_tasks

### Frontend: OrderManager.tsx + LiveOrderBoard
- 3-column Kanban (New → Preparing → Ready) with Supabase Realtime
- Manual order creation modal
- Status transitions: new→[preparing,cancelled], preparing→[ready,cancelled], ready→[delivered]
- Price snapshot: `price_at_purchase` freezes price at order time

## Phase 5.2: Enterprise MRP Engine

### Migration 023: MRP Engine & Scenario Planning
- `plan_status` ENUM: draft, active, completed
- `production_plans` + `plan_targets` tables
- `fn_run_mrp(UUID)` — 2-level BOM explosion + inventory deduction, cached in mrp_result JSONB
- `fn_approve_plan(UUID)` — creates production_tasks from plan

### MRP Algorithm
1. Read targets (SALE items + quantities)
2. Explode SALE→PF/MOD via bom_structures
3. Deduct PF/MOD from inventory_batches (sealed/opened, not expired)
4. Net PF/MOD→RAW explosion
5. Direct SALE→RAW BOM links
6. Deduct RAW from inventory_balances
7. Return: {prep_schedule (PF/MOD to make), procurement_list (RAW to buy)}

### Frontend: MasterPlanner.tsx
3-step wizard: Scenario Builder → MRP Dashboard → Approve & Send to Kitchen

## Phase 5.3: Knowledge Base Refactoring
- Archived 60+ legacy files to _Archive/
- Installed Obsidian Skills (kepano): obsidian-markdown, obsidian-bases, json-canvas, obsidian-cli, defuddle
- Created `Shishka OS Architecture.md` with Mermaid diagram
- RULE-ARCH-NOTE-SYNC added (Obsidian Protocol)

## Phase 5.4: Agent Skills & Capabilities
- Installed Anthropic Skills: pdf, xlsx, skill-creator
- Created custom `shishka-invoice-parser` skill
- Created `Agent Skills & Capabilities.md` registry
