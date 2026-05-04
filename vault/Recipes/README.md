---
title: Recipes
type: entity
tags: [recipes, kitchen, bom]
date: 2026-04-29
status: active
related:
  - "[[Menu/]]"
  - "[[Equipment/]]"
  - "[[Procurement/]]"
---

# Recipes

The cooking layer — BOMs, technique, food-cost rollup. Where [[Menu/]] is what the customer picks, **Recipes/** is what the kitchen executes. Every dish on the menu decomposes here through the **Lego BOM chain**: RAW → PF → MOD → SALE.

> [!info] One-line definition
> Recipes are the structured chef knowledge — every dish is a tree of ingredients (RAW), prep recipes (PF), modifiers (MOD), all rolled up into a sales unit (SALE) with locked food cost and standardised production routing.

## Sub-pages

- [[Recipes/Kitchen Philosophy]] — the food worldview (red lines, signature principles, sourcing integrity, Lego modularity)
- [[Recipes/BOM Structure]] — how the SALE → PF/MOD → RAW chain composes
- [[Recipes/Production Routing]] — `recipes_flow` — the steps each dish travels through (which equipment, which zone)

## Where things live

| Asset | Location |
|---|---|
| BOM data | `bom_structures` table (DB) |
| Production routing data | `recipes_flow` table (DB) — migrations 073, 074, 124 |
| Recipe authoring tool | `apps/admin-panel/src/components/kitchen/RecipeBuilder.tsx` |
| Bulk recipe extraction | `scripts/extract_recipes.mjs` |
| Reference culinary library | `knowledge/cooking/` (193 cookbooks; reference, not active SSoT) |

## The four product types

| Type | Code prefix | Description | Example |
|---|---|---|---|
| **RAW** | `RAW-*` | Raw ingredients purchased from suppliers | `RAW-FRESH_CARROT` |
| **PF** | `PF-*` | Semi-finished — prep recipes | `PF-BAKED_PUMPKIN` |
| **MOD** | `MOD-*` | Modifiers / toppings — customer add-ons at order time | `MOD-SOUR_CREAM` |
| **SALE** | `SALE-*` | Final dishes sold to customers | `SALE-BORSCH_BIOACTIVE` |

See `docs/domain/nomenclature.md` for the full naming convention.

## Adjacent entities

- [[Menu/]] — customer view of the SALE layer
- [[Equipment/]] — the units the recipes route through
- [[Procurement/]] — the supplier side of RAW
- [[Finance/Targets & KPIs]] — the FC ≤ 30% gate every recipe must pass
- [[Database/Schema]] — `bom_structures` + `recipes_flow` schema

## Recent decisions

- See `vault/Decisions/` — D-020 (equipment routing in `recipes_flow`, not `equipment` table) when written

## See Also

- `docs/bible/kitchen-philosophy.md` — owner-authored food worldview
- `docs/domain/nomenclature.md` — product type system
- `agents/chef/AGENT.md` — Chef Agent that operates this layer
