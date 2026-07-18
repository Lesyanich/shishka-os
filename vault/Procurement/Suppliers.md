---
title: Suppliers
type: pointer
tags: [procurement, suppliers, catalog]
date: 2026-07-18
status: pointer
related:
  - "[[Procurement/]]"
  - "[[Procurement/Purchase Logs]]"
  - "[[Recipes/BOM Structure]]"
---

# Suppliers

> **Pointer page.** The detail that used to live here was a 2026-04-29 snapshot that drifted out of date. Trust the source of truth below, not a copy. _(Wiki staleness audit, 2026-07-18.)_

**Source of truth:** `docs/modules/procurement.md`

- The `suppliers` + `supplier_catalog` model (SKU mapping, `purchase_unit`/`conversion_factor`/`base_unit`, `last_seen_price`).
- ⚠️ `supplier_catalog` stores `last_seen_price` — there is no `wac` column; WAC lives on `nomenclature.cost_per_unit`.

_See also:_ [[Procurement/Purchase Logs]], [[Recipes/BOM Structure]]
