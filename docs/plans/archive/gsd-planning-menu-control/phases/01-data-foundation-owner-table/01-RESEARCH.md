# Phase 1: Data Foundation + Owner Table — Research

**Researched:** 2026-04-14
**Status:** RESEARCH COMPLETE

## Executive Summary

Phase 1 has significant existing code (`MenuPage.tsx`, `OwnerTable.tsx`, `useMenuDishes.ts`) that covers ~60% of requirements. The work is primarily gap-filling, not greenfield. Key gaps: missing `description` field in data layer, no L2 subcategory grouping, incomplete empty states, and missing "No BOM" / "No KBJU" badges.

## Existing Code Audit

### useMenuDishes.ts (Data Hook)
**Location:** `apps/admin-panel/src/hooks/useMenuDishes.ts`
**Status:** Functional but incomplete

| Feature | Status | Gap |
|---------|--------|-----|
| Fetch SALE dishes | ✅ Works | `product_code LIKE 'SALE-%'` filter in place |
| display_order sort | ✅ Works | `.order('display_order', { ascending: true })` |
| Category join | ✅ Works | L1 only — joins `product_categories` via `category_id` |
| Tag join | ✅ Works | `nomenclature_tags` → `tags` junction query |
| Nutrition fields | ✅ Works | `calories, protein, carbs, fat` selected |
| `description` field | ❌ Missing | Not in SELECT, not in `MenuDish` interface |
| L2 subcategory data | ❌ Missing | No `parent_id` or `level` fetched from `product_categories` |
| Cost from BOM | ⚠️ Partial | Uses `cost_per_unit` directly — no BOM rollup query. Relies on pre-computed field. |

**`description` fix:** Add `description` to the Supabase `.select()` and `MenuDish` interface. Field exists on `nomenclature` table.

**L2 subcategory fix:** The `product_categories` table has `parent_id` and `level` columns (confirmed in `FinanceManager.tsx` line 301: `.select('id, code, name, parent_id, level')`). Need to:
1. Fetch categories separately with `parent_id` and `level`
2. Build L1→L2 hierarchy in the hook
3. Return `subcategories` alongside `categories`

### MenuPage.tsx (Page Component)
**Location:** `apps/admin-panel/src/pages/menu/MenuPage.tsx`
**Status:** Mostly complete

| Feature | Status | Gap |
|---------|--------|-----|
| View toggle (Owner/Customer) | ✅ Works | `useState<ViewMode>('owner')` |
| Owner layout toggle (table/gallery) | ✅ Works | Bonus feature not in spec |
| Category tabs with "All" | ✅ Works | L1 only, no L2 |
| Stats row | ✅ Works | Total, available, featured, avg FC% |
| Loading state | ✅ Works | Loader2 spinner |
| Error state | ✅ Works | Rose-colored error box |
| Empty state (global) | ❌ Missing | No ChefHat icon empty state (D-08) |

### OwnerTable.tsx (Table Component)
**Location:** `apps/admin-panel/src/pages/menu/components/OwnerTable.tsx`
**Status:** Has inline editing (Phase 3 scope) but missing Phase 1 columns

| Column | Status | Gap |
|--------|--------|-----|
| Name | ✅ Exists | With inline edit (Phase 3 feature, already built) |
| Category | ✅ Exists | Badge with category_name |
| Price | ✅ Exists | With inline edit, ฿ format |
| Cost | ✅ Exists | ฿ format |
| Food Cost % | ✅ Exists | Color-coded badge (green/amber/red) |
| Margin | ✅ Exists | Color-coded (emerald/rose) |
| Available toggle | ✅ Exists | Switch with optimistic update |
| Featured toggle | ✅ Exists | Star icon with optimistic update |
| Description | ❌ Missing | D-04 requires truncated description column |
| L2 section headers | ❌ Missing | D-02 requires divider rows for L2 subcategories |
| "No BOM" badge | ❌ Missing | D-07 — shows "—" but no badge |
| "No KBJU" badge | ❌ Missing | D-07 — no nutrition indicator |
| Category-specific empty | ❌ Missing | D-09 — header with "(0 dishes)" |

### CustomerPreview.tsx
**Location:** `apps/admin-panel/src/pages/menu/components/CustomerPreview.tsx`
**Status:** Basic — Phase 1 only needs placeholder content (D-10)

Already filters `is_available` dishes and renders `DishCard` grid. Phase 1 says "placeholder content" — current implementation is sufficient as placeholder.

## Database Schema Findings

### product_categories table
Confirmed columns from FinanceManager code:
- `id` (UUID)
- `code` (string)
- `name` (string)
- `parent_id` (UUID, nullable — null = L1, set = L2/L3)
- `level` (integer — 1, 2, 3)
- `sort_order` (integer)

### nomenclature table
Fields already used: `id, name, product_code, price, cost_per_unit, is_available, is_featured, image_url, calories, protein, carbs, fat, category_id, display_order`

Field needed but not fetched: `description` (text, nullable)

## Gap Analysis vs Requirements

| Requirement | Status | Work Needed |
|-------------|--------|-------------|
| MENU-01: Display all SALE dishes | ✅ Done | None |
| MENU-02: Group by L1 tabs + L2 headings | ⚠️ Partial | Add L2 subcategory grouping |
| MENU-03: Sort by display_order | ✅ Done | None |
| MENU-04: Empty states | ❌ Gap | Add ChefHat empty state + category empty state |
| OWN-01: Show all columns | ⚠️ Partial | Add description column |
| OWN-02: Food cost % color coding | ✅ Done | None |
| OWN-05: Category headers with count | ❌ Gap | Add L2 section headers with dish count |
| VIEW-01: View toggle | ✅ Done | None |
| VIEW-02: Persist toggle state | ✅ Done | Session-level via useState |
| DATA-01: Single query, no N+1 | ✅ Done | Uses Promise.all with 2 queries |
| DATA-02: Cost from cost_per_unit | ✅ Done | Pre-computed field |
| DATA-03: Food cost % formula | ✅ Done | `(cost_per_unit / price) * 100` |

## Technical Approach

### 1. useMenuDishes Changes
- Add `description` to SELECT and `MenuDish` interface
- Add separate categories query with `parent_id, level` to build hierarchy
- Return `subcategories: Map<string, MenuCategory[]>` (L1 id → L2 children)

### 2. OwnerTable Changes
- Add Description column after Name (truncated ~40 chars, title attr for full text)
- Add L2 section header rows (full-width `<tr>` with L2 name + dish count badge)
- Add "No BOM" slate badge when `cost_per_unit` is null
- Add "No KBJU" slate badge when all nutrition fields are null
- Add per-category empty state: header with "(0 dishes)" text

### 3. MenuPage Changes
- Add global empty state with ChefHat icon when no dishes exist
- Pass subcategory data to OwnerTable for L2 grouping

### 4. No Changes Needed
- CustomerPreview — placeholder is sufficient for Phase 1
- View toggle — already working
- Category tabs — L1 level already works
- Food cost color coding — already correct

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| `description` column might not exist | Low | Supabase will return null if missing; SELECT won't fail |
| L2 subcategories might not exist in data | Low | Graceful fallback — if no L2 children, just show flat list |
| Inline editing already built (Phase 3) | None | It's already there and working; leave as-is |
| `cost_per_unit` relies on pre-computed value | Medium | May be stale; STATE.md notes `cost_updated_at` concern — defer freshness label |

## Estimated Scope

- **Files to modify:** 3 (useMenuDishes.ts, OwnerTable.tsx, MenuPage.tsx)
- **Files to create:** 0
- **New dependencies:** 0
- **Complexity:** Low-medium — gap-filling on existing working code
