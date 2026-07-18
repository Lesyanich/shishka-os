---
title: Product Categorization Architecture
type: pointer
tags:
  - architecture
  - shishka-os
  - categorization
  - fmcg
date: 2026-07-18
status: pointer
aliases:
  - FMCG Categorization
  - Product Categories
  - Category System
---

# Product Categorization Architecture

> **Pointer page.** The detail that used to live here was a 2026-04-29 snapshot that drifted out of date. Trust the source of truth below, not a copy. _(Wiki staleness audit, 2026-07-18.)_

**Source of truth:** the live DB tables `product_categories` / `brands` / `tags` (3-level hierarchy + auto-derive bridge via `default_fin_sub_code`).

- Query these tables directly for the current category tree, brand directory, and tag taxonomy — they change as the menu grows.
- ⚠️ Live counts are **144 category nodes (3 L1 / 23 L2 / 118 L3), 72 brands, 71 tags** — the page's old 75 / 10 / 37 figures are stale.

_See also:_ [[Database/Schema]], [[Finance/Ledger]], [[Menu/Categories]]
