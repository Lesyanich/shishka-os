# Project Research Summary

**Project:** Menu Control & Preview Page
**Domain:** Restaurant ERP — dual-view menu management dashboard (owner ops + customer preview)
**Researched:** 2026-04-13
**Confidence:** HIGH

## Executive Summary

The Menu Control & Preview page is a self-contained admin panel feature that gives the restaurant owner a single place to view, manage, and preview their menu. Industry patterns (Toast, Square, Lightspeed, MarginEdge) converge on the same core: a data-dense owner table that surfaces cost economics alongside operational toggles, paired with a card-grid customer preview accessible via a single toggle. The feature is well-documented and maps directly to existing Shishka codebase conventions — no new dependencies are required. All data already exists in the `nomenclature`, `product_categories`, `bom_structures`, `tags`, and `nomenclature_tags` tables from migration 020.

The recommended approach is a single `/menu` route with a `viewMode` toggle (`owner | preview`), a shared `useMenuData` hook that fetches everything in one Supabase query, and props-drilled rendering that swaps between a hand-rolled owner table and a card grid. React 19's `useOptimistic` handles inline edits and availability toggles without any additional query library. The entire implementation follows the established `useSkuManager` pattern already in the codebase. Zero new npm packages are needed.

The two meaningful risks are: (1) stale `cost_per_unit` values misleading the owner on food cost %, and (2) editing state being silently lost if the view toggle unmounts components mid-edit. Both are preventable with early architectural decisions: add a freshness label to cost display in Phase 1, and lift editing state above the view toggle before building any inline field. All other pitfalls are standard inline-editing hygiene (debounce toggles, isolate draft state from server state, join tags in one query).

---

## Key Findings

### Recommended Stack

The existing admin-panel stack (Vite 7 + React 19 + React Router 7 + Tailwind CSS 4 + Supabase JS 2) covers every requirement. No additional packages are needed or recommended. React 19's `useOptimistic` hook (stable since December 2024) replaces the need for TanStack Query or any mutation library for this page. TanStack Table v9 is still in alpha as of April 2026 and should not be introduced; hand-rolled `<table>` with Tailwind matches all other data tables in this codebase.

**Core technologies:**
- **React 19 `useOptimistic`**: optimistic toggle and inline-edit updates — already installed, no flicker on mutations
- **Supabase JS v2 nested select**: single-query dish + category + tags fetch — eliminates N+1 risk from the start
- **Tailwind CSS v4**: all layout, card grid, badge styling, dark-only theme — no component library needed
- **lucide-react**: all icons (ChefHat placeholder, toggle icons, edit icons) — already installed
- **React Router 7 search params**: persist `?view=preview` in URL so toggle state survives navigation

### Expected Features

**Must have (table stakes):**
- All SALE dishes listed, grouped by L1 category — core purpose, owner cannot manage what they cannot see
- Dish name, description, price in owner view — minimum daily review fields
- Cost + food cost % + margin in owner view — without economics, the page is just a list
- `is_available` toggle per dish ("86" control) — industry-standard sold-out management
- Inline editing: name, description, price — without this, every price change requires separate navigation
- Customer preview card layout — owner needs to see what customers see
- Nutrition badges (kcal, protein, carbs, fat) in preview — data exists in migration 020; health-conscious Thailand market expects it
- Dietary/allergen tags on cards — legal and ethical expectation in food service
- Display order respected — random order signals unprofessionalism

**Should have (differentiators):**
- Food cost % color coding (green < 30%, amber 30–45%, red > 45%) — instant margin triage, no other panel page does this
- `is_featured` toggle (hero flag) — curate spotlight dishes without a separate workflow
- Recommended price hint (`cost * (1 + markup_pct/100)`) — shows if pricing drifted from target
- Category count badge "8/12 available" — instant category health at a glance
- Unavailable items dimmed in owner view, hidden in customer preview — shows full picture to owner while hiding off-menu items from customers
- `?view=preview` URL persistence — prevents annoying toggle reset on navigation

**Defer (v2+):**
- Image upload UI — requires Supabase Storage plumbing, separate milestone
- Drag-and-drop display reorder — DnD library overhead, low urgency; inline `display_order` field edit sufficient
- Bulk availability toggle — edge case, per-item toggle sufficient for v1
- Real-time multi-user sync — single-owner ERP, no concurrent editing scenario
- Menu engineering quadrant view (Star/Plowhorse/Dog/Puzzle) — requires POS sales velocity data not yet available
- PDF/print export — low ERP value, managed outside system
- Multi-language UI — architecture should be i18n-ready (externalize strings) but no i18n library yet

### Architecture Approach

Single `/menu` route. `useMenuData` hook owns all server state (one Supabase query with nested joins for categories and tags). `MenuPage` owns UI state (`viewMode`, `activeCategory`). Both views render from the same data; only the component tree swaps. `DishOwnerRow` handles inline editing with local draft state isolated from the server array. `DishCard` is purely read-only. Category hierarchy: L1 as horizontal tabs, L2 as section headings within tab content, L3 as inline labels — never nested tab bars.

**Major components:**
1. `useMenuData` — fetch + optimistic mutations; hook-local, view-agnostic; unblocks everything else
2. `MenuOwnerView` + `DishOwnerRow` — cost table with inline editing, availability/featured toggles
3. `MenuPreviewView` + `DishCard` + `NutritionBadges` + `TagPills` — read-only customer card grid
4. `MenuPageHeader` — two-segment view toggle + L1 category tab strip
5. `CategorySection` — shared section wrapper (polymorphic children: rows or cards)
6. `InlineEditField` + `AvailabilityToggle` + `FeaturedToggle` — reusable mutation primitives

Supporting modules required before any component code: `lib/menuMath.ts` (food cost %, margin, edge cases) and `lib/formatThb.ts` (currency formatting with explicit `th-TH` locale).

### Critical Pitfalls

1. **Editing state lost on view toggle** — if `isEditing`/`draftValues` live inside `DishOwnerRow`, React unmount/remount on toggle silently discards the unsaved edit. Prevention: lift `editingDishId` and `editDraft` into a `useMenuEditing` hook or `MenuPage` state that survives the toggle. Auto-save or prompt "unsaved changes" before allowing toggle.

2. **Stale `cost_per_unit` displayed as current** — BOM rollup is not live-recalculated when ingredient WAC prices change. Owner may make pricing decisions on weeks-old cost data. Prevention: label the cost column "Last calculated cost", show `cost_updated_at` timestamp, add a "Recalculate" action button (Phase 2 at minimum, freshness label in Phase 1).

3. **`is_available` toggle race condition on rapid clicks** — multiple in-flight PATCH requests resolve out of order, diverging UI from DB. Prevention: debounce 300–500ms + disable toggle while mutation is pending per dish ID + sync UI state FROM the server response, not from the click value.

4. **3-level category hierarchy rendered as nested tabs** — three stacked tab rows consume the viewport before any dishes appear. Prevention: inspect actual data depth first; enforce the rule L1=tabs, L2=headings, L3=labels as a spec decision before building navigation.

5. **Inline edit focus lost on re-render** — if another mutation (e.g., a toggle on a different dish) causes the hook to overwrite `dishes` from server, a controlled input snaps back to the server value mid-typing. Prevention: store draft value separately from server data; never write server data into display for a dish that is currently being edited.

---

## Implications for Roadmap

Based on the dependency chain identified in ARCHITECTURE.md and the pitfall phase warnings from PITFALLS.md, a 4-phase build order is recommended.

### Phase 1: Data Foundation + Owner Table (Display-only)

**Rationale:** Everything depends on `useMenuData`. The hook must be built first and validated before any UI. Owner table display (without mutations) delivers immediate value and validates the data model. Shared math and formatting utilities must be in place before any cost figures render.
**Delivers:** Working owner table with all dishes grouped by category, cost metrics visible, availability status shown — no inline editing yet. Freshness label on cost column.
**Addresses:** All table-stakes features except inline editing. Food cost % color coding (zero extra work once data is fetched).
**Avoids:**
- Pitfall 12 (N+1 tags) — single joined Supabase select from the start
- Pitfall 6 (locale currency) — `formatThb()` utility before first render
- Pitfall 7 (formula drift) — `menuMath.ts` before any card component
- Pitfall 4 (nested tabs) — inspect actual category data depth, define L1=tabs/L2=headings rule upfront

**Key tasks:**
- `types/menu.ts` — `MenuDish`, `MenuCategory`, `ViewMode` types
- `lib/menuMath.ts` — `computeFoodCostPct`, `computeMargin`, `computeRecommendedPrice` pure functions
- `lib/formatThb.ts` — `formatThb(n)` with explicit `th-TH` locale
- `hooks/useMenuData.ts` — single Supabase query, client-side category tree reconstruction
- `MenuPageHeader.tsx` — two-segment view toggle (owner | preview) + L1 category tabs
- `MenuOwnerView.tsx` + `CategorySection.tsx` + `DishOwnerRow.tsx` (display-only)

### Phase 2: Customer Preview View

**Rationale:** Preview depends on the data hook from Phase 1 but requires zero mutations. It can be built once the hook is validated. Building preview before inline editing keeps each phase independently shippable and avoids premature complexity.
**Delivers:** Full customer card grid with dish photos (or placeholders), nutrition badges, allergen/dietary tags, pricing. View toggle wired. URL search param persistence.
**Addresses:** Customer preview toggle, card layout, nutrition badges, allergen tags, placeholder images, unavailable items hidden in preview.
**Avoids:**
- Pitfall 8 (broken image layout) — `DishCard` requires placeholder component before first render
- Pitfall 11 (null nutrition shown as 0) — gate entire badge row on data presence
- Pitfall 10 (toggle label ambiguity) — two-segment control, both options always visible

**Key tasks:**
- `DishCard.tsx` — photo placeholder, name, description, price, unavailable overlay
- `NutritionBadges.tsx` — gated render when all values null
- `TagPills.tsx` — dietary + allergen tag pills
- `MenuPreviewView.tsx` — card grid layout
- Wire `?view=preview` URL search param in `MenuPage`

### Phase 3: Inline Editing + Mutations

**Rationale:** Inline editing is the highest-complexity item and requires the display-only owner table (Phase 1) to be solid first. The editing state architecture (lifted above view toggle) must be defined before building individual field editors. This phase also introduces optimistic mutations via `useOptimistic`.
**Delivers:** Full inline editing for name, description, price. `is_available` toggle (with debounce + race condition prevention). `is_featured` toggle. Optimistic UI for all mutations.
**Addresses:** Inline editing table stake, is_available toggle, is_featured differentiator.
**Avoids:**
- Pitfall 1 (edit state lost on toggle) — `useMenuEditing` hook or lifted state established BEFORE building fields
- Pitfall 3 (toggle race condition) — debounce + per-dish pending flag from the start
- Pitfall 5 (focus lost on re-render) — draft state isolated from server state in hook

**Key tasks:**
- `useMenuEditing.ts` (or add to `useMenuData`) — lifted `editingDishId` + `editDraft` state
- Integrate `useOptimistic` in `useMenuData` for dish list
- `InlineEditField.tsx` — double-click edit, Enter save, Escape cancel
- `AvailabilityToggle.tsx` — debounced, with per-dish pending flag
- `FeaturedToggle.tsx`
- `DishOwnerRow.tsx` — full inline editing with all mutation primitives wired

### Phase 4: Polish + Registration

**Rationale:** Final wiring and differentiator polish. Recommended price hint and category count badge are low-complexity but depend on having a working page to slot into. App.tsx registration and nav item are last because they expose the page to the owner — only after Phases 1–3 are verified.
**Delivers:** Recommended price hint, category count badges, display order note/tooltip (no drag), stale cost freshness label with recalculate action. Page registered in `App.tsx` + `AppShell.tsx` nav.
**Addresses:** Recommended price hint differentiator, category count badge differentiator, Pitfall 2 recalculate action (if deferred from Phase 1 label-only approach), Pitfall 9 (drag expectation — explicit tooltip explaining reorder workflow).

**Key tasks:**
- Recommended price hint in `DishOwnerRow` (if `markup_pct` > 0)
- Category count badge in `CategorySection` header
- "Last calculated cost" label + `cost_updated_at` display + Recalculate button
- Display order tooltip / "Reorder via Nomenclature page" note
- Register lazy route in `App.tsx`, add nav item to `AppShell.tsx` `NAV_ITEMS`

### Phase Ordering Rationale

- `useMenuData` must come first — it is the dependency root for all components
- Preview (Phase 2) before inline editing (Phase 3) because it is read-only and validates data shape without mutation complexity
- Mutations (Phase 3) last among functional phases because they introduce the most state complexity and require Phase 1 display to be verified
- Each phase is independently shippable and testable

### Research Flags

Phases with well-documented patterns (skip additional research):
- **Phase 1:** Hook pattern and table rendering are directly mirrored from existing `useSkuManager` — no research needed
- **Phase 2:** Card grid, badges, and tag pills are pure Tailwind + existing badge patterns — no research needed
- **Phase 4:** All polish items are straightforward additions

Phases that may need a brief research-phase check during planning:
- **Phase 3 — `useOptimistic` integration:** React 19 `useOptimistic` is stable but the codebase has not used it yet. Confirm the correct pattern for wrapping a list (not a single value) before implementation. Reference: https://react.dev/reference/react/useOptimistic
- **Phase 1 — RLS write check:** Verify the existing Supabase RLS policy on `nomenclature` (from migration 014) allows authenticated `UPDATE` before assuming write access works. One SQL query before building any mutation.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified against actual `package.json`; no assumptions. TanStack v9 alpha status confirmed via GitHub releases. React 19 `useOptimistic` confirmed stable via react.dev. |
| Features | HIGH | Industry consensus from Toast, Square, Lightspeed, MarginEdge. Schema ground truth confirmed from migration 020 — all required fields exist. Differentiator features marked MEDIUM pending owner workflow validation. |
| Architecture | HIGH | Component boundaries and data flow directly modeled on existing `useSkuManager` / `SkuManagerPage` pattern. Supabase nested select capability confirmed in official docs. |
| Pitfalls | HIGH (stack-specific), MEDIUM (UX patterns) | Stack-specific pitfalls (N+1, race conditions, `useOptimistic` rollback) verified against source code and docs. UX pitfalls (edit state on toggle, focus loss) based on community consensus and React docs on state preservation. |

**Overall confidence:** HIGH

### Gaps to Address

- **`cost_per_unit` freshness mechanism:** It is confirmed that the column is pre-computed and not live-updated, but the exact trigger/migration that populates it (and whether a `cost_updated_at` column exists or needs adding) should be verified before implementing the freshness label. Check `bom_structures` schema and any existing triggers.
- **RLS write policy on `nomenclature`:** Research flagged this; verify before Phase 3 begins. One query: `SELECT * FROM pg_policies WHERE tablename = 'nomenclature'`.
- **Actual L1 category count:** PITFALLS.md recommends inspecting real data before defining category nav pattern. Confirm exact L1 node count from `product_categories` — if only 1–2 L1 categories, collapse the tab bar entirely.
- **`markup_pct` population rate:** Recommended price hint is only useful if `markup_pct` is set on dishes. Check actual population before building the hint (if all are 0, the differentiator has no value in Phase 4).

---

## Sources

### Primary (HIGH confidence)
- `apps/admin-panel/package.json` — exact installed package versions
- `apps/admin-panel/src/hooks/useSkuManager.ts` — established hook pattern
- `apps/admin-panel/src/pages/SkuManager.tsx` — table and toggle UI pattern
- `services/supabase/migrations/020_storefront_pricing.sql` — schema ground truth
- `vault/Architecture/Product Categorization Architecture.md` — L1/L2/L3 hierarchy
- [React 19 `useOptimistic` — official docs](https://react.dev/reference/react/useOptimistic)
- [Supabase: Querying Joins and Nested Tables](https://supabase.com/docs/guides/database/joins-and-nesting)
- [TanStack Table GitHub releases](https://github.com/TanStack/table/releases) — v9 alpha status confirmed

### Secondary (MEDIUM confidence)
- [MarginEdge Menu Analysis Feature](https://help.marginedge.com/hc/en-us/articles/360038991914-How-to-use-the-Menu-Analysis-Feature) — food cost visibility patterns
- [Toast — 86 Item Availability](https://support.lunchbox.io/en/articles/8684629-lb-1-0-toast-item-availability-86-items-from-toast) — availability toggle UX
- [Square — Managing Items](https://squareup.com/help/us/en/article/6425-managing-items-with-square-for-restaurants) — industry standard sold-out management
- [Lightspeed — Item Availability](https://k-series-support.lightspeedhq.com/hc/en-us/articles/10724827631259-Setting-up-and-using-Item-availability) — snooze/availability UX
- [PatternFly Inline Edit Guidelines](https://www.patternfly.org/components/inline-edit/design-guidelines/)
- [React 19 `useOptimistic` Deep Dive — DEV Community](https://dev.to/a1guy/react-19-useoptimistic-deep-dive-building-instant-resilient-and-user-friendly-uis-49fp)
- [React — Preserving and Resetting State](https://react.dev/learn/preserving-and-resetting-state) — view toggle state loss pitfall

### Tertiary (LOW confidence — needs validation)
- Menu engineering quadrant framework (Star/Plowhorse/Dog/Puzzle) — deferred; requires sales velocity data not yet in Shishka data model

---
*Research completed: 2026-04-13*
*Ready for roadmap: yes*
