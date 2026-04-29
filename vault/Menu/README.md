---
title: Menu
type: entity
tags: [menu]
date: 2026-04-29
status: placeholder
---

# Menu

> [!warning] Placeholder
> This entity folder will be populated during the content build-out (MC task B-3, follow-up to audit `a180ff33`). For now it is a stub.

## Scope

Customer-facing menu, dish concept, nutrition framing, pricing, customer experience.

## Sources to extract from (B-3 input)

- `nomenclature` table (`type='dish'`, `product_code LIKE 'SALE-%'`)
- `recipes_flow` table — production routing for each dish
- `apps/admin-panel/src/pages/menu/` — menu control + customer preview
- `docs/bible/menu-concept.md`, `docs/bible/menu-items.md`
- `vault/Architecture/Product Categorization Architecture.md` (will move to `Menu/Product Categorization.md`)
