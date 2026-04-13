# Feature Landscape: Menu Control & Preview Page

**Domain:** Restaurant ERP — owner menu management dashboard + customer-facing menu preview
**Researched:** 2026-04-13
**Scope:** Single `/menu` page in existing admin panel (Vite + React 19 + RR7, dark-only theme)

---

## Table Stakes

Features that users expect. Missing = the page feels broken or useless.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| All SALE dishes listed, grouped by category | Core purpose of the page. Owner cannot manage what they cannot see. | Low | Data exists: `nomenclature` type='dish', `product_categories` hierarchy |
| Category sections with clear visual separation | Industry-standard menu layout. Sections without visual separation are disorienting. | Low | Derive from L1→L3 `product_categories` tree |
| Dish name + description + price in owner view | Minimum fields an owner reviews daily. Anything less forces navigation away. | Low | All in `nomenclature` |
| Cost + food cost % + margin in owner view | Without economics, the page is just a list — no different from a spreadsheet. Every menu management tool (MarginEdge, MarketMan) surfaces these as primary columns. | Low | `cost_per_unit` from BOM rollup; `price` from `nomenclature`; food cost % = cost/price |
| is_available toggle per dish ("86" control) | Industry term: "86ing" an item. Toast, Square, Lightspeed all have this. Owner needs to pull items off the menu without deleting them. | Low | `is_available` boolean already in schema |
| Inline editing: name, description, price | Without inline edit, every price change requires navigation to a separate page — major friction for daily ops. | Medium | Requires optimistic UI + Supabase update; scope limited to storefront fields only |
| Customer preview mode (card layout) | Owner needs to see what customers will see. A toggle to flip views is the minimum viable preview. | Medium | Same data, different component |
| Dish cards with name, description, price in preview | What every digital menu (QR code menus, website menus) shows. Customers expect cards, not tables. | Low | Pure display, no new data |
| Placeholder image when `image_url` is null | Without a placeholder, absent images break card layout. Photo is the #1 engagement driver on menu cards. | Low | Use a generic food placeholder SVG/component |
| Nutrition badges (kcal, protein, carbs, fat) in preview | Health-conscious customers in Thailand expect this. Data already captured in migration 020. | Low | `calories`, `protein`, `carbs`, `fat` columns exist |
| Dietary/allergen tags on cards | Allergen disclosure is a legal and ethical expectation in food service. Common iconography (GF, V, Vegan, Nuts) is industry-standard. | Low | `tags` + `nomenclature_tags` junction; `allergens` text[] also available |
| Display order respected | Menu is a curated experience — random order signals unprofessionalism. | Low | `display_order` field exists in schema |

---

## Differentiators

Features that go beyond expectations and add real value for an ERP-backed menu page.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| is_featured toggle (hero flag) | Lets owner curate spotlight dishes for homepage or marketing without a separate workflow. Most menu tools don't expose this in the menu view itself. | Low | `is_featured` boolean in schema; surface as a star/badge icon toggle |
| Food cost % color coding (green/amber/red) | Instant visual triage: owner sees at a glance which dishes are margin problems. No other page in the panel currently does this. | Low | Thresholds: <30% = good (green), 30-45% = caution (amber), >45% = danger (red) — industry rule of thumb |
| Recommended price hint | Show `cost * (1 + markup_pct/100)` next to the actual price. Owner sees immediately if pricing drifted from target. | Low | `markup_pct` column exists from migration 020 |
| Preview/owner toggle with URL-state persistence | If the toggle resets on navigation, it's annoying. Persist the active view in URL search param (`?view=preview`). | Low | React Router 7 search params; no extra infra |
| Unavailable items visually dimmed in owner view (not hidden) | Shows what's off-menu without losing the full picture. Hiding them forces a separate "show hidden" workflow. | Low | CSS opacity + strikethrough; industry pattern from Lightspeed, Square |
| Unavailable items hidden in customer preview | In preview, unavailable = invisible. This is what customers see on the real site. | Low | Simple filter before render |
| Category count badge (available / total) | "Mains: 8/12 available" gives owner instant category health at a glance. | Low | Computed from filtered dish list |

---

## Anti-Features

Features to deliberately NOT build in this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Image upload UI | Out of scope per PROJECT.md. Adding it now bloats scope with S3/Supabase Storage plumbing that is a separate milestone. | Use placeholder image component; add `image_url` field display only |
| Recipe/BOM editing from this page | BOM editing belongs on the BOM page. Duplicating it here creates two sources of truth for cost structure. | Link to BOM Hub from dish row if owner needs to edit cost structure |
| Ordering / cart functionality | This is an admin preview, not a storefront. Cart logic requires customer auth, payment gateway, order pipeline — a different product entirely. | Out of scope for admin panel |
| Multi-language UI (Thai/Burmese) | i18n framework adds build complexity and translation management that is not validated yet. Architecture should be i18n-ready but strings stay English. | Externalize string literals; no i18n library |
| PDF/print export | Low-value for an ERP panel. Printed menus are managed outside ERP. Adds PDF generation dependency. | Not needed |
| Menu engineering quadrant view (Star/Plowhorse/Dog/Puzzle) | Requires sales volume data (POS integration or order history aggregation) that is not available yet. Color-coded food cost % serves the same warning function now. | Revisit when order history is queryable |
| Drag-and-drop reorder | Complex DnD library, touch support overhead, optimistic persistence — high effort for a feature the owner can manage via `display_order` field edit in inline mode. | Allow inline editing of `display_order` numeric value if needed later |
| Bulk availability toggle (select all / deselect) | Adds multi-select state management. Edge case: owner rarely 86s an entire category. | Per-item toggle is sufficient for v1 |
| Real-time multi-user sync (Supabase Realtime) | Single-owner ERP; no concurrent editing scenario in v1. Adds subscription plumbing for no benefit. | Standard Supabase query/mutation; refresh on save |

---

## Feature Dependencies

```
Category sections visible
  → requires: product_categories query (L1→L3 hierarchy)

Food cost % display
  → requires: cost_per_unit populated via BOM rollup
  → if cost_per_unit is null → show "—" not 0% (prevent misleading display)

Recommended price hint
  → requires: markup_pct set on dish
  → if markup_pct = 0 → hide hint (default is 0, not useful)

Inline editing saves
  → requires: Supabase RLS policy allowing authenticated update on nomenclature
    (check existing RLS from migration 014 before assuming write access)

Nutrition badges in preview
  → requires: calories / protein / carbs / fat populated
  → if all null → hide badge row entirely (don't show empty badges)

Allergen/dietary tags
  → requires: nomenclature_tags junction populated + tags table
  → display is additive: no tags = no badge row

is_featured toggle visible in preview
  → owner view only; customer preview must NOT show financial or internal flags

Customer preview card layout
  → depends on: owner view toggle switch (same page, same data, different render)
```

---

## MVP Recommendation

Build in this order (each step is independently shippable):

1. **Owner table view** — list all SALE dishes with category grouping, name, description, price, cost, food cost %, is_available toggle. This alone delivers 80% of owner value.

2. **Food cost % color coding** — zero extra data fetching, high signal. Add immediately after table renders.

3. **Customer preview toggle** — card layout with name, description, price, nutrition badges, allergen tags. Reuses all data already fetched for owner view.

4. **Inline editing** — name, description, price, is_available. Requires optimistic UI pattern and Supabase mutation. Ship last because it's the highest-complexity item and the view is already useful without it.

**Defer:** is_featured toggle (low urgency), recommended price hint (useful but not critical), category count badge (polish).

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Table stakes features | HIGH | Industry consensus from Toast, Square, Lightspeed, MarginEdge, MarketMan — all surface cost/margin + availability toggle as core |
| Schema coverage | HIGH | Migration 020 confirmed all required fields exist: price, cost, markup_pct, calories, protein, carbs, fat, allergens, is_available, is_featured, display_order |
| Differentiators | MEDIUM | Color-coded food cost % and recommended price hint are common in dedicated recipe costing tools (MarginEdge, MarketMan) but less common in ERP admin panels — should be validated against owner workflow |
| Anti-features (exclusions) | HIGH | Exclusions derived directly from PROJECT.md out-of-scope list + engineering complexity analysis |
| Menu engineering quadrants | LOW (deferred) | Requires sales velocity data not yet available in Shishka's data model |

---

## Sources

- [MarginEdge Menu Analysis Feature](https://help.marginedge.com/hc/en-us/articles/360038991914-How-to-use-the-Menu-Analysis-Feature) — food cost visibility patterns
- [Toast — 86 Item Availability](https://support.lunchbox.io/en/articles/8684629-lb-1-0-toast-item-availability-86-items-from-toast) — availability toggle UX
- [Square — 86 Items](https://squareup.com/help/us/en/article/6425-managing-items-with-square-for-restaurants) — industry standard for sold-out management
- [Lightspeed — Item Availability](https://k-series-support.lightspeedhq.com/hc/en-us/articles/10724827631259-Setting-up-and-using-Item-availability) — snooze/availability UX patterns
- [Peazi — Dietary and Allergen Tags](https://www.peazi.com/blog/why-your-digital-menu-must-include-dietary-and-allergen-tags) — customer-facing tag display
- [Menu Engineering Matrix — Toast](https://pos.toasttab.com/blog/on-the-line/menu-engineering-matrix) — Star/Plowhorse/Dog/Puzzle context (deferred)
- [Restaurant Menu Design Guide — GoFoodservice](https://www.gofoodservice.com/guides/restaurant-menu-design-ultimate-guide-for-better-menus) — visual hierarchy and display order rationale
- [QSR Magazine — Restaurant Website Elements 2025](https://www.qsrmagazine.com/story/8-essential-elements-every-restaurant-website-needs-in-2025/) — customer preview expectations
- Internal: `services/supabase/migrations/020_storefront_pricing.sql` — schema ground truth
