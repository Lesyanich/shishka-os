---
title: D-026 — Nomenclature base_unit conventions by product_code prefix
type: decision
id: D-026
tags: [decision, kitchen]
date: 2026-04-24
status: ratified
decided_by: lesia
domain: Procurement
supersedes: []
superseded_by: null
related:
  - "[[Domains/Procurement]]"
  - "[[Projects/Data Health Self-Learning Loop]]"
aliases: []
---

# D-026 — Nomenclature base_unit conventions by product_code prefix

> [!decision] Decided 2026-04-24 by lesia
> `nomenclature.base_unit` is set by `product_code` prefix per the Shishka physical-kitchen convention; encoded as data_health rule `NOMENCLATURE_PREFIX_BASE_UNIT_CONVENTION`.

## Context

Cleanup run `311dc7fe` (2026-04-24) accumulated 14 manual_edit decisions where CEO corrected auto-created rows that defaulted to `pcs`. The corrections clustered cleanly by prefix and physical handling — solids weighed, liquids by volume, portioned dishes counted per serving, abstract modifier buckets counted as one application.

## Decision

Apply by prefix: `PF-*` solids → `kg`, `PF-*` liquids/`*_BASE` → `L`, `PF-*` dough/starter → `portion`; `MOD-*` weighed toppings → `kg`, `MOD-*` abstract buckets (TOPPINGS, ADDONS, GARNISH) → `pcs`; `SALE-*` "(portion)" → `portion`, `SALE-*` Side items → `pcs`; fresh produce/herbs (`RAW-*`, F-PRD-HRB) → `kg` (pack size lives in `sku.package_qty` / `supplier_catalog.conversion_factor`).

## Rationale

Without a prefix-driven default, every new row inherits `pcs` and silently breaks inventory rollups. The convention reflects how the kitchen physically handles each class, so `run_rules.py preview` proposes the right unit before it hits production.

## See Also

- [[Domains/Procurement]]
- [[Projects/Data Health Self-Learning Loop]]
