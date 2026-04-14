---
phase: 01-data-foundation-owner-table
plan: 01
subsystem: menu-data-hook
tags: [data-layer, supabase, hooks, menu]
dependency_graph:
  requires: []
  provides: [useMenuDishes-description, useMenuDishes-display_order, useMenuDishes-subcategories]
  affects: [menu-owner-table, menu-customer-preview]
tech_stack:
  added: []
  patterns: [parallel-supabase-queries, subcategory-map]
key_files:
  created: []
  modified:
    - apps/admin-panel/src/hooks/useMenuDishes.ts
decisions:
  - "MenuSubcategory uses Map<string, MenuSubcategory[]> keyed by parent_id for O(1) lookup"
  - "description in updateDish uses null-safe trim (?.trim() ?? null) to handle nullable field"
metrics:
  duration: 193s
  completed: 2026-04-14T14:44:53Z
---

# Phase 01 Plan 01: Data Hook Extension Summary

Extended useMenuDishes hook with description, display_order, and L2 subcategory hierarchy for owner table and customer preview.

## What Changed

### MenuDish Interface
- Added `description: string | null` for dish text display
- Added `display_order: number | null` for sorting verification

### MenuSubcategory Interface (new export)
- `id`, `name`, `parent_id`, `sort_order` fields
- Returned as `Map<string, MenuSubcategory[]>` keyed by L1 category id

### Supabase Queries
- Nomenclature SELECT now includes `description` and `display_order`
- Third parallel query added: `product_categories` filtered by `parent_id IS NOT NULL`
- Subcategory map built after Promise.all resolves

### updateDish
- Patch type expanded to accept `description`
- Null-safe trim: `patch.description?.trim() ?? null`

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 943e954 | Add description, display_order, and L2 subcategory hierarchy to useMenuDishes |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Null-safe description trim in updateDish**
- **Found during:** Task 1, step 9
- **Issue:** Plan specified `patch.description.trim()` but `description` is `string | null` -- calling `.trim()` on `null` would throw TypeError at runtime
- **Fix:** Changed to `patch.description?.trim() ?? null`
- **Files modified:** apps/admin-panel/src/hooks/useMenuDishes.ts
- **Commit:** 943e954

## Verification

- TypeScript `tsc --noEmit` passes with zero errors
- MenuDish interface has `description` and `display_order` fields
- MenuSubcategory interface is exported
- UseMenuDishesResult includes `subcategories` field
- Three parallel queries in Promise.all (nomenclature, tags, product_categories)
- `updateDish` accepts `description` in patch

## Self-Check: PASSED
