# Technology Stack

**Project:** Menu Control & Preview Page
**Researched:** 2026-04-13
**Scope:** UI components and patterns for dual-view menu page within existing admin-panel

---

## Existing Stack (Do Not Change)

| Layer | Technology | Version |
|-------|-----------|---------|
| Bundler | Vite | ^7.3.1 |
| UI framework | React | ^19.2.0 |
| Routing | React Router DOM | ^7.13.1 |
| Styling | Tailwind CSS | ^4.2.1 |
| Icons | lucide-react | ^0.577.0 |
| Charts | recharts | ^3.8.0 |
| Backend | Supabase JS | ^2.98.0 |
| Language | TypeScript | ~5.9.3 strict |

**No new npm dependencies are required for this milestone.**
All patterns below are achievable with the existing stack.

---

## Recommended Patterns

### 1. View Toggle (Owner / Customer)

**Pattern:** Local `useState<'owner' | 'customer'>` on the page component.

**Why:** The two views share the same data fetch. Toggling is purely presentational — no routing, no new library. Consistent with how existing pages handle mode switching (e.g., SkuManager toggling `showInactive`).

**Implementation:**
```tsx
const [view, setView] = useState<'owner' | 'customer'>('owner')
```

The toggle UI uses a two-button pill segment matching the existing dark-slate design system — `bg-slate-800` inactive, `bg-slate-600` active, `rounded-full` container. No external toggle library needed. Lucide `LayoutGrid` / `Table2` icons for the buttons.

**Confidence: HIGH** — directly observable in existing codebase patterns.

---

### 2. Owner Dashboard Table (with cost metrics)

**Pattern:** Hand-rolled `<table>` with Tailwind classes, matching the pattern in `SkuManager.tsx` and `ExpenseHistory`.

**Why:** The existing codebase has zero dependency on TanStack Table, AG Grid, or any table library. All data tables are built with native HTML `<table>` + Tailwind. Introducing TanStack Table v8 (stable) or v9 (alpha as of April 2026) for a single page violates the project's minimal-dependency posture and adds ~40KB to the bundle.

**Do NOT use:**
- `@tanstack/react-table` — not installed, v9 still alpha (alpha.20 as of March 2026), overkill for this use case
- `mantine-react-table` — requires Mantine, not in stack
- AG Grid — enterprise dependency, wrong for this scale

**Column set for owner table:**

| Column | Source field | Format |
|--------|-------------|--------|
| Name | `name` | Text, inline editable |
| Category | `product_categories.name_l1` | Badge |
| Price | `price` | `฿ X,XXX` |
| Cost | `cost_per_unit` | `฿ X,XXX` |
| Food Cost % | computed | Color-coded badge (green <30%, amber 30–45%, red >45%) |
| Margin | computed | `฿ X,XXX` |
| Available | `is_available` | Toggle switch |
| Featured | `is_featured` | Toggle switch |

**Confidence: HIGH**

---

### 3. Inline Editing

**Pattern:** Click-to-edit cells using local `editingId` + `editingField` state, identical to how `SkuManager` opens an edit modal but flattened to cell-level.

**Recommended approach — row-level inline (not modal):**
- Clicking a cell in the owner table puts that row into edit mode
- The row renders `<input>` elements in place of static text for editable fields (`name`, `description`, `price`)
- Non-editable computed fields (`cost`, food cost %) remain static
- Save on blur or Enter key; cancel on Escape
- Use React 19 `useOptimistic` for instant UI feedback before the Supabase `.update()` resolves

**Why useOptimistic instead of local loading state:**
React 19 ships `useOptimistic` as a stable hook (released December 2024). It eliminates the flicker pattern where the UI reverts to stale data during the async save, which is highly visible in a price/cost table. The existing codebase does not use it yet but React 19.2.0 is already installed.

**Pattern sketch:**
```tsx
const [optimisticRows, updateOptimistic] = useOptimistic(
  rows,
  (state, { id, patch }: { id: string; patch: Partial<DishRow> }) =>
    state.map((r) => (r.id === id ? { ...r, ...patch } : r))
)
```

**Confidence: HIGH** (useOptimistic is stable in React 19, confirmed via react.dev)

---

### 4. is_available / is_featured Toggles

**Pattern:** Custom toggle built with a `<button>` + Tailwind transition classes. Already used implicitly throughout the codebase (e.g., `showInactive` toggle in SkuManager). No external toggle library.

```tsx
// Pattern already in codebase — replicate:
<button
  onClick={() => handleToggle(dish.id, 'is_available')}
  className={`relative h-5 w-9 rounded-full transition-colors ${
    dish.is_available ? 'bg-emerald-500' : 'bg-slate-700'
  }`}
>
  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
    dish.is_available ? 'translate-x-4' : 'translate-x-0.5'
  }`} />
</button>
```

**Confidence: HIGH**

---

### 5. Customer Preview — Card Grid

**Pattern:** CSS Grid with `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` Tailwind classes, each card a custom component.

**Why not a card library:** The card design needs to match the owner's specific branding vision (restaurant aesthetic, dark theme, photo placeholder, nutrition badges). Generic card libraries (shadcn Card, Mantine Card) add wrapper overhead with less customization control. Given the codebase builds all UI from Tailwind primitives, a hand-built `DishCard` component is the correct choice.

**DishCard structure:**
```
┌──────────────────────────┐
│  [Photo / Placeholder]   │  aspect-[4/3], bg-slate-800
│──────────────────────────│
│  Category badge          │  text-xs, emerald/amber by category
│  Dish name               │  text-base font-semibold text-slate-100
│  Description             │  text-sm text-slate-400 line-clamp-2
│  Nutrition badges row    │  cal / protein / carbs / fat
│  Dietary/allergen tags   │  vegan, gluten-free, etc.
│──────────────────────────│
│  ฿ Price                 │  text-lg font-bold text-emerald-400
│  [Unavailable overlay]   │  if !is_available
└──────────────────────────┘
```

**Confidence: HIGH**

---

### 6. Nutrition & Tag Badges

**Pattern:** Inline `<span>` elements with Tailwind, no badge library.

Existing pattern from `DeviationBadge.tsx` and `ConflictBadge.tsx` — small `<span className="rounded px-1.5 py-0.5 text-[10px] font-medium">` elements.

Nutrition badge color mapping:
- Calories → `bg-amber-900/40 text-amber-300`
- Protein → `bg-sky-900/40 text-sky-300`
- Carbs → `bg-violet-900/40 text-violet-300`
- Fat → `bg-rose-900/40 text-rose-300`

Dietary/allergen tags (from `tags` table, group = 'dietary' / 'allergen'):
- Use tag color from DB or fall back to `bg-slate-700 text-slate-300`

**Confidence: HIGH**

---

### 7. Category Sections / Tab Navigation

**Pattern:** Horizontal scrollable tab strip above the content area (owner or customer view). Tabs derived from `product_categories` L1 level.

**Why tabs over sidebar sections:** The menu has ~5 L1 categories. A horizontal tab strip (`overflow-x-auto`, `flex gap-2`, sticky positioning) keeps categories accessible without vertical space cost. Vertical accordion sections are an alternative but break the card grid layout in customer view.

**Active tab state:** `useState<string>('all')` — filter dishes client-side after fetch.

**Confidence: HIGH**

---

### 8. Photo Placeholder

**Pattern:** Gradient placeholder `<div>` with a lucide `UtensilsCrossed` or `ChefHat` icon centered. When `image_url` is present, render `<img>` with `object-cover`.

No image library (no react-image, no next/image — this is Vite, not Next.js).

```tsx
{dish.image_url ? (
  <img src={dish.image_url} alt={dish.name} className="h-full w-full object-cover" />
) : (
  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
    <ChefHat className="h-10 w-10 text-slate-600" />
  </div>
)}
```

**Confidence: HIGH**

---

### 9. Data Fetching

**Pattern:** Custom hook `useMenuPage.ts` following the established `useSkuManager`, `useExpenseLedger` pattern.

The hook:
- Fetches `nomenclature` (type='dish', product_code LIKE 'SALE-%') joined with `product_categories`, `bom_structures` (for cost rollup), `nomenclature_tags` + `tags`
- Exposes `dishes`, `categories`, `isLoading`, `error`, `updateDish`
- `updateDish` calls `supabase.from('nomenclature').update(patch).eq('id', id)` and returns `{ ok, error }`
- Page uses `useOptimistic` wrapping the `dishes` array returned by the hook

**Confidence: HIGH**

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Table | Hand-rolled `<table>` | TanStack Table v8 | Not installed; v9 still alpha; overkill for one page |
| Inline edit | Row-level state | Modal (current SkuManager pattern) | Slower UX; more clicks; owner wants fast price edits |
| Cards | Hand-built DishCard | shadcn Card | shadcn not actually installed as npm pkg; codebase copies primitives or hand-rolls |
| Toggle | Custom `<button>` | headlessui Switch | Not installed; adds dependency for trivial UI |
| Optimistic UI | `useOptimistic` (React 19) | Local `isSaving` state | Already available; eliminates revert flicker |
| Category nav | Tab strip | Sidebar accordion | Accordion breaks card grid; tabs are space-efficient |

---

## No New Dependencies Required

The entire feature can be built with the existing package.json. Specifically:

- **lucide-react** covers all icons needed (ChefHat, Eye, EyeOff, Star, Edit3, Check, X, LayoutGrid, Table2, Tag, Flame, Dumbbell)
- **Tailwind CSS v4** covers all layout and animation needs
- **React 19 useOptimistic** covers optimistic updates (stable, no package needed)
- **Supabase JS** covers all data operations

**Confidence: HIGH** — verified by reading actual package.json (no shadcn primitives package installed, no TanStack, no component library beyond what's listed).

---

## Key Design Constraints

1. **Dark-only theme** — all components use `bg-slate-900`, `bg-slate-800`, `text-slate-100/400/500` palette. No light mode variants.
2. **No new tables** — all data comes from `nomenclature`, `product_categories`, `bom_structures`, `tags`, `nomenclature_tags`.
3. **Display order** — render dishes sorted by `display_order ASC NULLS LAST` within each category.
4. **i18n-ready** — all string literals in named constants or a `LABELS` object at top of file, not scattered inline.

---

## Sources

- [shadcn/ui React 19 compatibility](https://ui.shadcn.com/docs/react-19) — confirmed React 19 support
- [TanStack Table releases](https://github.com/TanStack/table/releases) — v9 still alpha as of March 2026
- [React useOptimistic](https://react.dev/reference/react/useOptimistic) — stable in React 19
- [shadcn inline edit table pattern](https://www.shadcn.io/blocks/tables-inline-edit) — reference pattern (adapted to hand-rolled style)
- Codebase audit: `apps/admin-panel/package.json`, `SkuManager.tsx`, `ExpenseEditModal.tsx`, `DeviationBadge.tsx`
