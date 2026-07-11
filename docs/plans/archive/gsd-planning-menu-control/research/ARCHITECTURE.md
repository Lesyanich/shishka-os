# Architecture Patterns: Menu Control & Preview Page

**Domain:** Dual-view menu management — owner dashboard + customer preview toggle
**Researched:** 2026-04-13
**Overall confidence:** HIGH (based on existing codebase patterns + verified React 19 / Supabase docs)

---

## Recommended Architecture

Single page at `/menu`, lazy-loaded via the existing `App.tsx` pattern. The page owns a
`viewMode` toggle (`'owner' | 'preview'`). Both views share a single data fetch; only
the rendering layer switches. Mutations originate exclusively from the owner view.

```
MenuPage (route /menu)
├── MenuPageHeader          ← title, view toggle switch, category tab bar
├── [viewMode === 'owner']
│   └── MenuOwnerView
│       └── CategorySection (×N)
│           └── DishOwnerRow (×M)  ← inline-editable row
└── [viewMode === 'preview']
    └── MenuPreviewView
        └── CategorySection (×N)
            └── DishCard (×M)      ← customer-facing card
```

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `MenuPage` | Route entry point; owns `viewMode` state; passes data down | `useMenuData` hook, child views |
| `MenuPageHeader` | View toggle switch (owner / preview); category tab navigation | `MenuPage` (callback for viewMode, activeCategory) |
| `MenuOwnerView` | Renders CategorySections in table/list layout; receives dish array + mutations | `MenuPage`, `DishOwnerRow` |
| `MenuPreviewView` | Renders CategorySections in card grid layout; read-only | `MenuPage`, `DishCard` |
| `CategorySection` | Groups dishes under one category heading; used by both views (different children) | Receives filtered dishes, category metadata |
| `DishOwnerRow` | Single dish in owner view: shows cost, margin, food-cost %; inline editing for name/desc/price/availability/featured | `useMenuData` mutation callbacks |
| `DishCard` | Single dish in customer preview: photo placeholder, name, description, price, nutrition badges, tag pills | Read-only props |
| `NutritionBadges` | Renders calories/protein/carbs/fat as compact badges | Used by `DishCard` |
| `TagPills` | Renders dietary + allergen tag pills (color-coded by group) | Used by `DishCard`, optionally `DishOwnerRow` |
| `AvailabilityToggle` | Switch for `is_available`; optimistic update inline | Used by `DishOwnerRow` |
| `FeaturedToggle` | Switch for `is_featured` | Used by `DishOwnerRow` |
| `InlineEditField` | Double-click to edit text field (name, description, price); Enter to save, Escape to cancel | Used by `DishOwnerRow` |
| `useMenuData` | Data fetching hook: loads dishes + categories + tags; exposes mutation fns | `MenuPage` consumes, Supabase writes |

---

## Data Flow

### Fetch (read path)

```
Supabase
  nomenclature (type='dish', product_code LIKE 'SALE-%')
    JOIN product_categories (category_id → L3 → L2 → L1)
    JOIN nomenclature_tags → tags
  ↓
useMenuData hook
  ↓
MenuPage (holds dishes[], categories[], isLoading, error)
  ↓
props drilling: MenuOwnerView / MenuPreviewView → CategorySection → DishOwnerRow / DishCard
```

The single Supabase query fetches everything in one round-trip using nested select:

```typescript
supabase
  .from('nomenclature')
  .select(`
    id, name, description, product_code,
    price, cost_per_unit, markup_pct,
    calories, protein, carbs, fat,
    image_url, slug, is_available, is_featured, display_order,
    category:product_categories(id, code, name, level, parent_id),
    nomenclature_tags(tag:tags(id, name, group))
  `)
  .eq('type', 'dish')
  .like('product_code', 'SALE-%')
  .order('display_order', { ascending: true })
```

Category hierarchy reconstruction (L1 → L2 → L3 grouping) happens client-side in the
hook using the `parent_id` references already returned in the query. No recursive CTE
needed — 75 category nodes is small enough to resolve in JS.

### Mutation (write path)

```
DishOwnerRow (user edits field or toggles)
  ↓
useMenuData.updateDish(id, patch)   ← optimistic update first
  ↓
Supabase .from('nomenclature').update(patch).eq('id', id)
  ↓ success → keep optimistic state
  ↓ error   → revert to pre-edit state + show toast
```

React 19's `useOptimistic` hook fits here: the hook wraps dish list state so toggle
and inline-save changes appear instant, with automatic rollback on Supabase error.
This matches how Gmail-style toggles work — user never waits for a round-trip.

---

## State Management

No global state library is needed. All state lives in `useMenuData` + local component state.

| State | Where | Type |
|-------|-------|------|
| `dishes[]` | `useMenuData` | Supabase rows, optimistically patched |
| `categories[]` | `useMenuData` | Flat list, reconstructed into tree client-side |
| `isLoading` / `error` | `useMenuData` | Standard fetch lifecycle |
| `viewMode` | `MenuPage` | `'owner' \| 'preview'` (useState) |
| `activeCategory` | `MenuPage` | Category ID or null (all) |
| `editingDishId` | `DishOwnerRow` local | Which row is in edit mode |
| `editDraft` | `DishOwnerRow` local | Temp field values before save |

This follows the same pattern as `useSkuManager` and `useInventory` — no Context,
no Zustand, hook owns the server state, page owns the UI state.

---

## File Structure

```
src/
├── pages/
│   └── MenuPage.tsx                   ← route entry, useMenuData, viewMode toggle
├── components/
│   └── menu/
│       ├── MenuPageHeader.tsx          ← toggle switch + category tab bar
│       ├── MenuOwnerView.tsx           ← owner list layout
│       ├── MenuPreviewView.tsx         ← customer card grid layout
│       ├── CategorySection.tsx         ← shared section wrapper (renders children)
│       ├── DishOwnerRow.tsx            ← inline-editable table row
│       ├── DishCard.tsx                ← customer-facing card
│       ├── NutritionBadges.tsx         ← kcal / protein / carbs / fat badges
│       ├── TagPills.tsx                ← dietary + allergen pills
│       ├── AvailabilityToggle.tsx      ← is_available switch with optimistic update
│       ├── FeaturedToggle.tsx          ← is_featured switch with optimistic update
│       └── InlineEditField.tsx         ← double-click edit primitive
├── hooks/
│   └── useMenuData.ts                  ← fetch + mutations + optimistic state
└── types/
    └── menu.ts                         ← MenuDish, MenuCategory, ViewMode types
```

---

## Patterns to Follow

### Pattern: Hook owns server state, page owns UI state

Identical to `useSkuManager`. The hook returns `{ dishes, categories, isLoading, error,
updateDish, refetch }`. Page decides which view to render and which category tab is active.
Hook does not know about `viewMode` — it is view-agnostic.

### Pattern: Optimistic toggle

```typescript
// In useMenuData — toggleAvailability example
const [optimisticDishes, addOptimistic] = useOptimistic(dishes)

async function toggleAvailability(id: string, value: boolean) {
  addOptimistic(prev =>
    prev.map(d => d.id === id ? { ...d, is_available: value } : d)
  )
  const { error } = await supabase
    .from('nomenclature')
    .update({ is_available: value })
    .eq('id', id)
  if (error) {
    // React reverts optimistic state automatically on transition end
    setError(error.message)
  } else {
    setDishes(prev => prev.map(d => d.id === id ? { ...d, is_available: value } : d))
  }
}
```

This is the React 19 `useOptimistic` pattern (stable in React 19, verified at
https://react.dev/reference/react/useOptimistic).

### Pattern: Shared CategorySection with polymorphic children

`CategorySection` receives `dishes` filtered to its category and renders `children`.
`MenuOwnerView` passes `DishOwnerRow` children; `MenuPreviewView` passes `DishCard`
children. This keeps the category heading/spacing logic in one place.

### Pattern: Inline edit with local draft state

`DishOwnerRow` keeps `isEditing` and `draft` as local state. On double-click, field
enters edit mode. On Enter/blur, calls `useMenuData.updateDish(id, draft)`. On Escape,
discards draft. This matches the shadcn/ui inline-edit table block pattern.

---

## Anti-Patterns to Avoid

### Anti-Pattern: Two separate routes for owner and preview
**Why bad:** Forces page reload / navigation on toggle; owner loses their scroll position
and active category selection. The PROJECT.md requirement explicitly calls for a toggle
on one page.
**Instead:** Single `MenuPage` route with `viewMode` state.

### Anti-Pattern: Fetching dishes and categories separately in two hooks
**Why bad:** Double waterfall — categories load first, then dishes. Causes layout shift
and two loading spinners.
**Instead:** One `useMenuData` hook fetches both in a single Supabase query using nested
select (`JOIN product_categories`). Client-side reconstruction is trivial at this scale.

### Anti-Pattern: Building category tree via recursive CTE on Supabase
**Why bad:** Unnecessary complexity. 75 nodes (3 L1 + 16 L2 + 56 L3) is tiny; round-trip
to DB is slower than a JS array reduce.
**Instead:** Fetch flat category list, reconstruct tree client-side in `useMenuData`.

### Anti-Pattern: Separate edit page per dish
**Why bad:** Defeats the purpose of "see and control in one place." Navigating away breaks
the flow.
**Instead:** Inline editing in `DishOwnerRow` for the fields in scope (name, description,
price, is_available, is_featured). Recipe/BOM editing stays out of scope.

### Anti-Pattern: Global state (Context or Zustand) for dishes
**Why bad:** This page is self-contained. Nothing outside `/menu` needs dish data.
**Instead:** `useMenuData` local to the page; same pattern as all other pages in this panel.

---

## Suggested Build Order (Phase Dependencies)

```
1. useMenuData (hook + types)
   - No UI dependency; can be built and tested in isolation
   - Unblocks everything below

2. DishCard + NutritionBadges + TagPills
   - Read-only, no mutations needed
   - Can be built with mock data before hook is wired

3. MenuPreviewView + CategorySection
   - Composes DishCard
   - Validates data shape and grouping logic

4. MenuPageHeader (toggle + category tabs)
   - ViewMode switch
   - Requires categories[] from hook to render tabs

5. MenuOwnerView + DishOwnerRow (display-only first)
   - Owner layout with cost/margin columns
   - No inline editing yet

6. InlineEditField + AvailabilityToggle + FeaturedToggle
   - Inline mutation primitives
   - Requires useOptimistic integration in hook

7. DishOwnerRow (full inline editing)
   - Composes InlineEditField + toggles
   - Requires step 6

8. MenuPage (wire everything together)
   - Route entry; plug useMenuData into both views
   - Register in App.tsx + AppShell.tsx nav

9. App.tsx registration + AppShell nav item
   - Final wiring; lazy import `/menu` route
   - Add 'Menu' nav item to NAV_ITEMS array
```

Steps 2–5 can be developed in parallel once step 1 is done.

---

## Scalability Considerations

| Concern | At current scale (~30–50 dishes) | If menu grows to 200+ dishes |
|---------|----------------------------------|-------------------------------|
| Fetch volume | One query, all dishes in-memory | Add `.eq('is_active', true)` filter; consider pagination |
| Category rendering | Flat loop through category groups | No change needed; tree is pre-built |
| Inline edit conflicts | N/A (single owner) | N/A (single-user admin panel) |
| Image loading | `image_url` or CSS placeholder | Consider lazy loading with Intersection Observer |

---

## Key Technical Decisions

| Decision | Rationale | Confidence |
|----------|-----------|------------|
| `useOptimistic` (React 19) over TanStack Query | Project uses zero query libraries; adding TanStack Query for one page is disproportionate. `useOptimistic` is built into React 19 (already in stack). | HIGH |
| Single Supabase query with nested select | Supabase JS v2 supports multi-level joins via foreign keys. Verified: https://supabase.com/docs/guides/database/joins-and-nesting | HIGH |
| Client-side category tree reconstruction | 75 nodes — trivially fast in JS, avoids recursive CTE complexity | HIGH |
| No new global state | Consistent with all existing pages; hook-local state is sufficient | HIGH |
| Lazy import in App.tsx | All pages follow this pattern — keeps main bundle lean | HIGH |

---

## Sources

- [useOptimistic — React 19 official docs](https://react.dev/reference/react/useOptimistic)
- [React 19 release announcement](https://react.dev/blog/2024/12/05/react-19)
- [Supabase: Querying Joins and Nested tables](https://supabase.com/docs/guides/database/joins-and-nesting)
- [shadcn/ui inline edit table block](https://www.shadcn.io/blocks/tables-inline-edit)
- [One component, two layouts: dual view pattern in React — DEV Community](https://dev.to/sammiihk/one-component-two-layouts-the-dual-view-pattern-in-react-521a)
- Existing codebase patterns: `useSkuManager.ts`, `SkuManagerPage.tsx`, `App.tsx` (HIGH confidence — directly inspected)
- Migration 020: `services/supabase/migrations/020_storefront_pricing.sql` (HIGH confidence — directly inspected)
- Architecture doc: `vault/Architecture/Product Categorization Architecture.md` (HIGH confidence — directly inspected)
