---
title: Equipment Routing
type: page
tags: [equipment, routing]
date: 2026-04-29
status: active
related:
  - "[[Equipment/]]"
  - "[[Recipes/Production Routing]]"
---

# Equipment Routing

How recipes use equipment, and **why that knowledge does not live in the `equipment` table**.

## The principle (D-020)

> Equipment routing belongs to the recipe, not the unit.

A blast chiller doesn't "know" the order of operations for borscht — that knowledge is the recipe's. The `equipment` row holds:

- What the unit IS (model, capacity, location, status)
- Capex provenance (purchase date, cost, supplier)
- Maintenance lifecycle (last serviced, next due)

The `recipes_flow` row holds:

- Which step in the recipe uses which `equipment_id`
- Operation, duration, target temperature
- Zone (where physically in L1 the step happens)

This is decision **D-020 — equipment routing via recipes_flow** (Auto Memory, will promote to `vault/Decisions/D-020-...` on next sweep).

## Why it matters

Without the discipline:

- ❌ "What does the blast chiller do?" → answered with a list of recipes (couples unit to menu)
- ❌ Changing one recipe = updating `equipment` rows (wrong owner)
- ❌ Cross-recipe analysis (e.g. "which recipes block on the chiller?") becomes a query through `equipment.notes` instead of clean joins

With the discipline:

- ✅ `recipes_flow` answers process questions
- ✅ `equipment` answers asset questions
- ✅ A bottleneck analysis is `SELECT recipe, step FROM recipes_flow WHERE equipment_id = 'L1-BL-FRZ-790-66' GROUP BY recipe`

## Who owns what

| Question | Table |
|---|---|
| What units do we own? | `equipment` |
| What zone is unit X in? | `equipment.zone` |
| Is unit X working / under maintenance? | `equipment.status` |
| What capacity does unit X have? | `equipment.capacity_*` |
| **What does unit X do for recipe R?** | **`recipes_flow`** |
| **Which step uses unit X?** | **`recipes_flow.equipment_id`** |
| **What's the bottleneck for recipe R?** | join `recipes_flow` × `equipment.capacity_per_cycle` |

## Bottleneck — `L1-BL-FRZ-790-66`

The Blast Chiller appears in the routing of every recipe that involves hot processing (which is most of them — soups, proteins, roasted veg). Capacity-per-cycle × cycles-per-day caps the kitchen's daily output.

Production scheduling in [[Operations/Daily Standards]] sequences hot batches around this constraint:

```
07:00–08:00  Hot batch 1  → Blast Chiller cycle 1 (08:00–09:30)
                            (cannot start hot batch 2 until cycle 1 completes)
09:30–10:00  Vacuum + label batch 1 → ready for L2 dispatch
09:30–10:30  Hot batch 2  → Blast Chiller cycle 2 (10:30–12:00)
...
```

## Implementation references

- Schema: see `services/supabase/migrations/073_recipes_flow.sql`, `074_recipes_flow_seed.sql`, `124_recipes_flow_*.sql`
- Recipe Builder UI: `apps/admin-panel/src/components/kitchen/RecipeBuilder.tsx` writes to both `bom_structures` and `recipes_flow`
- Chef Agent: `mcp-chef.create_recipe_flow` tool

## See Also

- [[Recipes/Production Routing]] — same view from the recipe side
- [[Equipment/Inventory]] — the unit list this routing references
- [[Equipment/CapEx Flow]] — how units get added to the registry
