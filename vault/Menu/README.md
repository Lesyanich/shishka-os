---
title: Menu
type: entity
tags: [menu]
date: 2026-04-29
status: active
assets:
  - label: "Menu photos (Drive)"
    path: "Drive: 01_Business/Menu/"
related:
  - "[[Brand/]]"
  - "[[Recipes/]]"
  - "[[Finance/Targets & KPIs]]"
---

# Menu

The customer-facing menu of Shishka — what a guest sees, picks, and pays for. Built from the [[Recipes/]] layer (BOMs, technique) but presented from the **guest's** angle: categories, pricing, modifiers, customer experience.

> [!info] One-line definition
> Shishka's menu is a **modular salad-bar + grab-and-go + chef-led mains** offering, engineered around the Culinary Booster System (CBS) so 90% of flavor is pre-locked at L1 and L2 only assembles.

## Sub-pages

- [[Menu/Concept]] — what the menu IS: CBS, L1/L2 production model, food-cost philosophy, dish design constraints
- [[Menu/Categories]] — current category structure (Breakfasts, Salads, Bowls, Soups, Mains, Sandwiches/Rolls, Dairy)
- [[Menu/Pricing & Margins]] — FC ≤ 30% target, margin zones, color-coded health-check
- [[Menu/Product Categorization]] — the database-side structure (`product_categories` + `nomenclature` SALE-* + tags) that backs the customer view

## Where things live

| Asset | Location |
|---|---|
| Menu photos | Drive: `01_Business/Menu/` |
| Customer preview UI | `apps/admin-panel/src/pages/menu/` (the `/menu` admin route renders the same data the customer site will) |
| Database SSoT | `nomenclature` table (filtered `type='dish'` + `product_code LIKE 'SALE-%'`) joined with `product_categories` and `bom_structures` |
| Customer category routing | `apps/admin-panel/src/components/menu/customer/CategorySection.tsx` |

## Adjacent entities

- [[Brand/]] — voice, photography, visual system that the menu inherits
- [[Recipes/]] — the BOM + technique layer feeding the menu
- [[Procurement/]] — sourcing for the RAW layer
- [[Finance/Targets & KPIs]] — FC% target this menu must hit
- [[Operations/]] — daily operations that produce the menu in the kitchen

## Recent decisions

- [[Decisions/D-001-mempalace-deprecated]] (not menu-related, kept for backlink demo)

## Open questions

- TBD — none currently tracked in `Open Questions/`
