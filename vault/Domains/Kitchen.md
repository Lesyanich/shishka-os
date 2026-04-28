---
title: Kitchen
type: domain
tags:
  - domain
  - kitchen
  - operations
date: 2026-04-28
status: active
owners:
  - "[[People/Lesia]]"
  - "[[People/Alex]]"
  - "[[People/Hein]]"
bounded_context: Cooking, recipes, equipment routing, and the physical flow of food from raw ingredient to finished dish.
related:
  - "[[Domains/Menu]]"
  - "[[Domains/KDS]]"
  - "[[Domains/Procurement]]"
aliases:
  - Production
  - Cooking
---

# Kitchen

> [!info] Domain
> The physical and operational space where ingredients become dishes — recipes, equipment, and the steps that route food through the kitchen.

## Definition

Kitchen is everything between raw ingredient and finished dish. It owns recipes, semi-finished products (PF), modifiers (MOD), and the equipment routing that decides which station a dish passes through next. Routing lives in `recipes_flow`, not in the equipment table — the recipe determines the next step.

## Boundaries

Inside: recipes, BOM structures, prep flows, equipment routing, semi-finished and modifier nomenclature. Outside: customer-facing menu presentation ([[Domains/Menu]]), order-side display in the kitchen ([[Domains/KDS]]), and ingredient supply ([[Domains/Procurement]]).

## Active Projects

- [[Projects/Phase 7.1 DB Architecture]] — WAC costing + recipes_flow + production outputs
- [[Projects/ERP Consolidation]] — kitchen tooling unified under one role-based admin

## Recent Decisions

- [[Decisions/D-020-equipment-routing-via-recipes-flow]] — routing lives in recipes_flow, not equipment
- [[Decisions/D-026-nomenclature-prefix-base-unit-convention]] — PF/MOD/SALE base-unit conventions
- [[Decisions/D-005-db-and-mc-english-only]] — recipes and BOM stored in English

## See Also

- Architecture: [[Architecture/Shishka OS Architecture]], [[Architecture/Database Schema]]
- Milestones: [[Milestones/2026-04-24-nomenclature-name-unification]]
