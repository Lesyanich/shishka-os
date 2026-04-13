# Domain Pitfalls

**Domain:** Restaurant menu management admin panel — dual owner/preview view with inline editing
**Researched:** 2026-04-13
**Confidence:** HIGH (stack-specific), MEDIUM (UX patterns)

---

## Critical Pitfalls

Mistakes that cause rewrites, data corruption, or broken UX.

---

### Pitfall 1: Editing State Leaks Into the Preview View

**What goes wrong:** The toggle between owner and customer preview operates on a shared component tree. If the editing state (open input field, unsaved value) lives inside the dish card component rather than being lifted above the view toggle, switching to preview mid-edit leaves a dangling draft that is either silently dropped or incorrectly reflected in the preview.

**Why it happens:** The natural instinct is to put `isEditing` and `localValue` state inside the `DishCard` component for encapsulation. But when the parent unmounts/remounts cards during a view switch, React resets all child state — losing the user's unsaved work without any warning.

**Consequences:** User types a new price, clicks "Preview" to check how it looks, then returns to owner view and finds the price reverted. No error, no save. The change is silently lost.

**Prevention:**
- Keep `editingDishId` and `draftValues` in a parent-level state (or a `useMenuEditing` hook) that survives the view toggle.
- The view toggle should only swap _rendering_ (card vs. preview layout), not destroy the data layer.
- On view switch: if a dish is mid-edit, either auto-save or show a "You have unsaved changes — save or discard?" prompt before switching.

**Detection:** Test by opening a name field, toggling to preview, toggling back — check if the input value persisted.

**Phase:** Address in the component architecture phase before building the toggle.

---

### Pitfall 2: `cost_per_unit` Is Stale and Silently Wrong

**What goes wrong:** `cost_per_unit` on the `nomenclature` row is a pre-computed value populated by BOM rollup. It is NOT recalculated when ingredients change unless a migration or trigger runs. The menu page reads this column directly and displays food cost % and margin as if they are current — but they may be weeks stale.

**Why it happens:** The BOM rollup is a separate operation in `bom_structures`. Nothing in the schema triggers a recalculation on `nomenclature.cost_per_unit` when a raw material WAC price is updated. This is an architectural gap inherited from the existing system.

**Consequences:** Owner sees a food cost of 18% but the real current cost (based on latest Makro receipts) is 27%. Pricing decisions are made on fiction.

**Prevention:**
- Display `cost_per_unit` with a freshness indicator: the date it was last calculated (add a `cost_updated_at` column if not present, or derive from BOM's `updated_at`).
- Add a visible "Recalculate costs" action on the page that triggers a fresh BOM rollup for SALE-type items.
- Clearly label the cost column as "Last calculated cost" not just "Cost" to set expectation.
- Do NOT query BOM structures live on page load for all dishes — that will be slow. Use the pre-computed value but flag staleness.

**Detection:** Compare `nomenclature.cost_per_unit` vs. a manual BOM rollup for one dish with a recently changed ingredient price.

**Phase:** Surface in cost display phase. The recalculate action can be a Phase 2 item if Phase 1 adds the freshness label.

---

### Pitfall 3: `is_available` Toggle Race Condition on Rapid Clicks

**What goes wrong:** The `is_available` toggle fires a Supabase update on each click. If the owner clicks rapidly (on → off → on), two or three in-flight PATCH requests may resolve out of order. The final DB state and the UI state diverge silently — UI shows "available" but DB has "unavailable", or vice versa.

**Why it happens:** The existing hook pattern in this codebase (see `useSkuManager.ts`) uses direct `supabase.from(...).update()` calls with local state set immediately (pessimistic UI). With two in-flight mutations, whichever resolves last wins in the DB, but the UI reflects only the last click, not the last resolved response.

**Consequences:** A dish is marked as unavailable in the UI but still appears to customers if the DB has a different value. Or the reverse — owner thinks a dish is on the menu but it was accidentally toggled off.

**Prevention:**
- Debounce the toggle handler (300–500ms) to collapse rapid clicks into a single mutation.
- Disable the toggle while a mutation is pending (`isSaving` flag per dish ID in a `Map<string, boolean>`).
- After mutation resolves, sync local state FROM the server response, not from the click event value.
- Use React 19's `useOptimistic` for toggle displays — it provides automatic rollback if the mutation fails.

**Detection:** Open DevTools Network tab, click the toggle 3 times fast, count the PATCH requests and compare with final DB state.

**Phase:** Toggle implementation phase. Must be addressed before first use — a silent wrong state on `is_available` has direct customer-facing consequences.

---

### Pitfall 4: 3-Level Category Hierarchy Rendered as Nested Tabs Becomes Unusable

**What goes wrong:** `product_categories` has a 3-level hierarchy (L1 → L2 → L3). The naive approach is three nested tab rows (Tabs inside Tabs inside Tabs). At 3 levels, the UI requires 3 clicks to reach any dish. On a dark-only narrow admin panel, 3 tab rows stack vertically and consume most of the viewport before any dish cards appear.

**Why it happens:** The PROJECT.md says "Categories shown as sections/tabs derived from product_categories hierarchy" — this is ambiguous. Developers default to literal tab nesting.

**Consequences:** Owner scrolls past category navigation to reach dishes. On a 13" laptop (common restaurant office setup), dish cards appear below the fold. The page feels broken.

**Prevention:**
- Use L1 as horizontal tab navigation (typically 3–5 top-level categories: Bowls, Drinks, Snacks, etc.).
- Render L2 as section headings within the tab content, not as a second tab bar.
- Render L3 as sub-headings or inline labels on dish cards, not as navigation.
- If L1 has only 1–2 categories in the current data, collapse the tab bar entirely and use section headings only.
- Query the actual category data first — confirm how many L1/L2/L3 nodes exist before deciding the hierarchy display pattern.

**Detection:** Inspect `product_categories` data for actual depth and node count before rendering.

**Phase:** Category layout phase. Define the rendering rule (L1=tabs, L2=headings, L3=labels) as a spec decision before implementation.

---

### Pitfall 5: Inline Edit Loses Focus on Re-render (Supabase Real-time or Parent Re-fetch)

**What goes wrong:** The menu hook fetches from Supabase and stores the dish list in `useState`. If any parent component triggers a re-render while the user is typing in an inline field (e.g., the Supabase real-time subscription fires, or another toggle mutation invalidates and re-fetches the list), the input field loses focus or its value resets to the server value.

**Why it happens:** When the `dishes` array is replaced wholesale in state after a re-fetch, React reconciles the list. If the dish card component's key is the dish `id` (correct), the component is reused — but if the hook overwrites `dishes` with fresh server data, the controlled input's value snaps back to the server-side name.

**Consequences:** User types half a dish name, a background refresh fires, and their cursor jumps out of the field with the text reset. Extremely disorienting.

**Prevention:**
- Store the draft edit value separately from the server data. The hook exposes `serverDishes`; the edit layer holds `draftValue` independently. Only write `serverDishes` into display when the field is NOT in edit mode for that dish.
- Avoid real-time subscriptions on the `nomenclature` table while the menu page is open, or gate re-fetches: skip applying server updates for a dish that has `editingDishId === dish.id`.
- Use the `key` prop on the outer list to remain stable (use `dish.id`, never index).

**Detection:** Open an inline name field. Trigger another mutation (toggle a different dish's `is_available`). Check if the open input loses focus or resets.

**Phase:** Inline editing implementation phase. The re-fetch isolation pattern must be established early in the hook, before building individual field editors.

---

## Moderate Pitfalls

---

### Pitfall 6: Price Display Without Currency Locale Causes Financial Errors

**What goes wrong:** `price` is stored as `NUMERIC` in THB. Rendering it as `{dish.price}` outputs raw JS number formatting — JavaScript's `toLocaleString` defaults depend on the browser locale, so on a Thai browser `1234.5` may render as `1,234.5` or `1234,5` depending on system locale, causing owner confusion about whether the price is 1234 or 1234500 satang.

**Prevention:**
- Always format with explicit locale and currency: `new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 }).format(dish.price)`.
- Create a shared `formatThb(n: number): string` utility once and use everywhere — in the owner view, in the preview, and in cost/margin calculations.
- Decide upfront: display `฿1,234` or `1,234 ฿` — document the standard and enforce it across all fields.

**Phase:** Phase 1 (initial data display). Add the formatter before first render commit.

---

### Pitfall 7: Food Cost % and Margin Are Computed in the Component, Causing Drift

**What goes wrong:** Food cost % = `cost_per_unit / price * 100`. If this calculation is repeated inline in every card or in multiple places, and the formula definition drifts (some use `cost_per_unit`, others use a manual BOM sum), the owner sees different numbers in different views for the same dish.

**Prevention:**
- Define `computeMargin(cost: number, price: number)` and `computeFoodCostPct(cost: number, price: number)` as pure functions in a shared `lib/menuMath.ts` file.
- The owner view and any summary rows must import from this single file — never inline the formula.
- Handle edge cases explicitly: `price = 0` → return `null` (not `Infinity`); `cost = null` → return `null` with "No BOM" label.

**Phase:** Phase 1 alongside cost display. Establish the math module before writing any card component.

---

### Pitfall 8: Placeholder Image State Not Handled Causes Broken Layout

**What goes wrong:** `image_url` is `NULL` for most dishes at launch. If the `<img>` tag is rendered unconditionally without a fallback, browsers fire an error and show a broken image icon — especially jarring in the customer preview view where visual polish is the point.

**Prevention:**
- In customer preview cards, render a styled placeholder `<div>` with a dish silhouette icon (from `lucide-react`) when `image_url` is `null`.
- In owner view, render a small "No photo" badge instead of a broken image tag.
- Use the `onError` handler on `<img>` to swap to placeholder if a URL is present but the image fails to load (CDN hiccup).
- Standardize placeholder dimensions at card design time so the layout is stable whether the image loads or not (use `aspect-ratio` not fixed `height`).

**Phase:** Customer preview rendering phase.

---

### Pitfall 9: `display_order` Drag-and-Drop Is Out of Scope But Users Expect It

**What goes wrong:** The PROJECT.md states "display order respects `display_order` field from nomenclature." The `display_order` field exists. Once the owner sees a sorted list, they will immediately try to drag cards to reorder them — that UX expectation is nearly universal. If drag-and-drop is not built, the page needs a clear signal that reordering requires another workflow.

**Prevention:**
- Do not render any drag handle UI in v1.
- Add an explicit tooltip or inline note explaining that display order is managed via the BOM/Nomenclature page.
- Log the drag-and-drop reorder feature as a backlog item in Mission Control during implementation so it is not forgotten.

**Phase:** Phase 1 layout. Communicate the absence of reordering actively, not passively.

---

## Minor Pitfalls

---

### Pitfall 10: Toggle Button Label Ambiguity

**What goes wrong:** A toggle labeled "Preview" is ambiguous — does it mean "switch TO preview" or "currently IN preview"? If the label changes based on active state (shows "Owner View" when in preview mode, shows "Customer Preview" when in owner mode), users get confused reading the label as a state indicator rather than an action.

**Prevention:**
- Use an explicit two-segment control (SegmentedControl or RadioGroup style) with both options always visible: `[Owner View] [Customer Preview]`. The active segment is highlighted, the inactive one is clickable. No ambiguity.
- This pattern exists in the admin panel's dark theme already (see KDS board toggles for reference) — follow the same pattern.

**Phase:** Page scaffold phase.

---

### Pitfall 11: Nutrition Badges Show `null` Values as "0"

**What goes wrong:** `calories`, `protein`, `carbs`, `fat` columns are all nullable in migration 020. If the component renders `{dish.calories ?? 0} kcal`, the customer preview shows "0 kcal" for dishes with no nutrition data entered — which looks like intentional data, not missing data.

**Prevention:**
- Gate the entire nutrition badge row: only render badges if at least one nutrition value is non-null.
- In owner view, show a "No nutrition data" label with a link action (out of scope for this page, but label the gap).

**Phase:** Customer preview rendering phase.

---

### Pitfall 12: Tags Query N+1 Problem

**What goes wrong:** Tags come from a `nomenclature_tags` junction table with a `tags` join. If the menu hook fetches `nomenclature` first and then fetches tags per-dish in a loop, that is N+1 queries for N dishes — each query adding ~50–100ms on a Bangkok→Singapore Supabase round-trip.

**Prevention:**
- Fetch all tags in a single join query: `supabase.from('nomenclature').select('*, nomenclature_tags(tag:tags(*))')`. Supabase PostgREST supports this pattern natively.
- Do the join at hook level, not at card level. Cards receive pre-joined data as props.
- Confirm with the existing pattern in `useSkuManager.ts` — the project already uses joined selects with the `nomenclature_name` pattern.

**Phase:** Data hook implementation phase. The join must be in the initial hook design.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Data hook (`useMenuPage`) | N+1 tags query (Pitfall 12) | Single joined Supabase select from the start |
| Cost/margin display | Stale `cost_per_unit` (Pitfall 2) | Add freshness label + recalculate action |
| View toggle scaffold | Edit state lost on toggle (Pitfall 1) | Lift editing state above toggle before building fields |
| Inline name/description/price edit | Focus lost on re-render (Pitfall 5) | Isolate draft state from server state in hook |
| `is_available` toggle | Race condition (Pitfall 3) | Debounce + per-dish saving flag |
| Category navigation | Nested tabs unusable (Pitfall 4) | Inspect data depth first; use L1=tabs, L2=headings |
| Customer preview cards | Null image layout break (Pitfall 8) | Placeholder component required before first render |
| Customer preview cards | Null nutrition shown as 0 (Pitfall 11) | Gate entire badge row on data presence |
| Price rendering | Locale-dependent number format (Pitfall 6) | `formatThb()` utility in Phase 1 |
| Cost math | Formula drift across components (Pitfall 7) | `menuMath.ts` module before any card code |
| Display ordering | User drag expectation (Pitfall 9) | No drag UI; label the constraint explicitly |
| Toggle button | Label ambiguity (Pitfall 10) | Two-segment control, not a single toggle button |

---

## Sources

- [Inline Editing in Tables Design — UX Design World](https://uxdworld.com/inline-editing-in-tables-design/)
- [Inline Edit Design Guidelines — PatternFly](https://www.patternfly.org/components/inline-edit/design-guidelines/)
- [Inline Edit — Cloudscape Design System](https://cloudscape.design/patterns/resource-management/edit/inline-edit/)
- [Why I Never Use Optimistic Updates — DEV Community](https://dev.to/criscmd/why-i-never-use-optimistic-updates-and-why-you-might-regret-it-too-4jem)
- [React 19 useOptimistic Deep Dive — DEV Community](https://dev.to/a1guy/react-19-useoptimistic-deep-dive-building-instant-resilient-and-user-friendly-uis-49fp)
- [React Query Cache Invalidation — Stackademic / Kennedy Owusu](https://medium.com/@kennediowusu/react-query-cache-invalidation-why-your-mutations-work-but-your-ui-doesnt-update-a1ad23bc7ef1)
- [Toggle UX Tips — Eleken](https://www.eleken.co/blog-posts/toggle-ux)
- [Nested Tab UI Design Guidelines — Design Monks](https://www.designmonks.co/blog/nested-tab-ui)
- [Tabs Navigation Best Practices — LogRocket UX](https://blog.logrocket.com/ux-design/tabs-ux-best-practices/)
- [Preserving and Resetting State — React Docs](https://react.dev/learn/preserving-and-resetting-state)
- [Supabase Row Level Security — Official Docs](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [How to Build Inline Editable UI in React — LogRocket Blog](https://blog.logrocket.com/build-inline-editable-ui-react/)
- Project codebase: `apps/admin-panel/src/hooks/useSkuManager.ts` (existing mutation pattern)
- Project codebase: `services/supabase/migrations/020_storefront_pricing.sql` (schema reference)
