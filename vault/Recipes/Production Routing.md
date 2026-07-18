---
title: Production Routing
type: pointer
tags: [recipes, production, equipment]
date: 2026-07-18
status: pointer
related:
  - "[[Recipes/]]"
  - "[[Recipes/BOM Structure]]"
  - "[[Equipment/Routing]]"
---

# Production Routing

> **Pointer page.** The detail that used to live here was a 2026-04-29 snapshot that drifted out of date. Trust the source of truth below, not a copy. _(Wiki staleness audit, 2026-07-18.)_

**Source of truth:** `docs/bible/operations.md` + [[Database/Schema]]

- The cook-chill SOP (L1 → L2, blast-chiller bottleneck, the "90% cooked" rule) and the `recipes_flow` routing table.
- ⚠️ `recipes_flow` migrations are `073_chicken_grill_recipe_flow.sql` / `074_recipes_flow_v2.sql`, with 182 / 208 / 273 later adding haccp / merrychef_program / location_id.

_See also:_ [[Recipes/BOM Structure]] · [[Equipment/Routing]]
