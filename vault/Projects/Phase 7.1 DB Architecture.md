---
title: Phase 7.1 DB Architecture
type: project
tags: [project, database, architecture, foundation]
date: 2026-03-13
status: done
domain: "[[Domains/Admin Panel]]"
mc_task: null
spec: null
branch: feature/db/phase-7-1
pr_numbers: []
start: 2026-03-13
end: 2026-03-13
related: []
aliases: [Phase 7.1, DB Audit]
---

# Phase 7.1 DB Architecture

> [!info] Project
> The architectural decisions that locked Shishka's costing, supplier catalog, production, orders, and auth model.

## Objective

Phase 7.1 ratified the DB foundation that everything else builds on: Weighted Average Cost (WAC) for inventory, single `supplier_catalog` table replacing `supplier_item_mapping` + `supplier_products`, multi-output production via `production_task_outputs`, modifier order items via `parent_item_id` + `modifier_type`, Supabase Auth + RLS across 30 tables with `auth_full_access` policy, and a 3-tier SKU layer (`nomenclature` → `sku` → `supplier_catalog`) introduced in Phase 10.

## Current State

- **Phase:** done — schema in production
- **Owner:** [[People/Lesia]]
- **Migrations:** 054 (auth+RLS), 056 (drop ghost tables), 057 (sku layer), 058 (drop inventory_balances)

## Recent Outcomes

- 2026-03-13 — WAC costing, supplier_catalog SSoT, RLS rolled out across 30 tables
- 2026-03-13 — `recipes_flow` and `daily_plan` ghost tables dropped (mig 056); `fn_start_production_task` rewritten
- 2026-03-13 — 3-tier SKU layer landed (mig 057-058); `sku_balances` replaces `inventory_balances`

## Risks & Open Questions

- Migration 039 (UoM columns) was never applied to production — mig 049 has an EXCEPTION handler for this drift
- Backward-compat views `supplier_item_mapping` and `supplier_products` were eventually DROPPED in Phase 9

## See Also

- Related: [[Projects/Adaptive Receipt Learning]], [[Projects/Data Health Self-Learning Loop]], [[Projects/ERP Consolidation]]
- Domain: [[Domains/Admin Panel]]
