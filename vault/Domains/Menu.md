---
title: Menu
type: domain
tags:
  - domain
  - menu
date: 2026-04-28
status: active
owners:
  - "[[People/Lesia]]"
bounded_context: Dishes, prices, availability, photos, and how the menu is shown to owner and customer.
related:
  - "[[Domains/Kitchen]]"
  - "[[Domains/Finance]]"
aliases: []
---

# Menu

> [!info] Domain
> The set of dishes Shishka sells, their prices, photos, tags, and how they appear to both the owner (cost view) and the customer (preview).

## Definition

Menu is what the customer sees and what the owner controls. It owns dish names, descriptions, categories, photos, prices, availability, and featured flags — plus the cost rollup and food-cost percentage that tells the owner whether a dish is profitable.

## Boundaries

Inside: dish identity, presentation, pricing, availability toggles, owner cost view, customer preview. Outside: the recipes and equipment that produce the dish ([[Domains/Kitchen]]), the ledger that records sales ([[Domains/Finance]]), and the ingredient sourcing ([[Domains/Procurement]]).

## Active Projects

- [[Projects/Menu Control Page]] — unified `/menu` admin page with owner/customer toggle
- [[Projects/ERP Consolidation]] — sidebar grouping that surfaces menu inside admin

## Recent Decisions

- [[Decisions/D-026-nomenclature-prefix-base-unit-convention]] — SALE-* prefix conventions for dish records
- [[Decisions/D-005-db-and-mc-english-only]] — menu data stored in English

## See Also

- Architecture: [[Architecture/Database Schema]], [[Architecture/Product Categorization Architecture]]
- Milestones: [[Milestones/2026-04-22-menu-url-routing-v2]], [[Milestones/2026-04-21-menu-page-brand-tokens]]
- Code paths: `apps/admin-panel/src/pages/menu/`
