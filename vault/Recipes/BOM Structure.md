---
title: BOM Structure
type: pointer
tags: [recipes, bom, lego]
date: 2026-07-18
status: pointer
related:
  - "[[Recipes/]]"
  - "[[Database/Schema]]"
  - "[[Menu/Pricing & Margins]]"
---

# BOM Structure

> **Pointer page.** The detail that used to live here was a 2026-04-29 snapshot that drifted out of date. Trust the source of truth below, not a copy. _(Wiki staleness audit, 2026-07-18.)_

**Source of truth:** `docs/modules/bom.md` + `docs/domain/nomenclature.md`

- The Lego BOM chain (RAW → PF → MOD → SALE), the four product types, and the `bom_structures` schema.
- ⚠️ Chef MCP tools are `create_product` / `add_bom_line` (not `create_nomenclature` / `create_bom_lines`); `bom_structures` columns are `parent_id, ingredient_id, quantity_per_unit, yield_loss_pct`.

_See also:_ [[Recipes/Production Routing]] · [[Database/Schema]]
