---
title: Recipes
type: entity
tags: [recipes, kitchen]
date: 2026-04-29
status: placeholder
---

# Recipes

> [!warning] Placeholder
> This entity folder will be populated during the content build-out (MC task B-3, follow-up to audit `a180ff33`). For now it is a stub.

## Scope

Cooking knowledge, BOMs, technique, food cost rollup, recipe authoring patterns.

## Sources to extract from (B-3 input)

- `recipes_flow` table (migrations 073, 074, 124)
- `bom_structures` table — recipe → ingredients composition
- `apps/admin-panel/src/components/kitchen/RecipeBuilder.tsx`
- `scripts/extract_recipes.mjs`
- `knowledge/cooking/` (193 cookbooks — reference, not active SSoT)
