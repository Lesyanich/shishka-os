# Phase 1: Data Foundation + Owner Table - Context

**Gathered:** 2026-04-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Fetch all SALE-type menu data in one query and render a read-only owner cost table grouped by category. This is the data foundation — no editing, no customer preview, no route registration. Just fetch and display.

Requirements in scope: MENU-01, MENU-02, MENU-03, MENU-04, OWN-01, OWN-02, OWN-05, VIEW-01, VIEW-02, DATA-01, DATA-02, DATA-03

</domain>

<decisions>
## Implementation Decisions

### Code Readiness
- **D-01:** Existing code (MenuPage.tsx, OwnerTable.tsx, useMenuDishes.ts) should be verified against REQUIREMENTS.md and gaps filled — not rewritten. The page was built in a prior sprint; treat it as a working draft that needs alignment with the formal spec.

### Category Grouping (MENU-02)
- **D-02:** L1 categories shown as horizontal tab strip (already implemented). L2 subcategories shown as divider rows WITHIN the table — a full-width row with L2 name and dish count badge (e.g. "Signature Bowls (3 dishes)"). No nested tabs.
- **D-03:** "All" tab shows all categories; each L1 tab filters to that category. L2 grouping headers appear in both "All" and individual L1 views.

### Owner Table Columns (OWN-01)
- **D-04:** Full column set per row: Name | Description (truncated) | Price (฿) | Cost (฿) | Food Cost % | Margin (฿) | Available (toggle) | Featured (star icon)
- **D-05:** Description column shows first ~40 chars with ellipsis. Full text visible on hover (title attr) or in future accordion expansion.

### Food Cost % Thresholds (OWN-02)
- **D-06:** Color-coded badge: green (<30%), amber (30-45%), red (>45%). These thresholds match CLAUDE.md spec.

### Empty States (MENU-04)
- **D-07:** When a dish has no BOM/cost data: show muted "—" in cost/FC%/margin columns + small slate badge "No BOM". When no KBJU: badge "No KBJU". These become CTA buttons ("Fill with AI Chef") in Phase 5.
- **D-08:** When no dishes exist at all: centered empty state message with ChefHat icon and text "No dishes yet".
- **D-09:** When a category has no dishes after filtering: show category header with "(0 dishes)" and no table rows.

### View Toggle (VIEW-01, VIEW-02)
- **D-10:** Toggle between Owner and Customer Preview exists in header. Customer Preview renders placeholder content in Phase 1 (actual cards come in Phase 2). Toggle state persists in component state (session-level, not localStorage).

### Claude's Discretion
- Table row height and padding — follow existing admin panel patterns (text-xs/text-sm, px-3 py-2)
- Loading skeleton vs spinner — existing pattern uses Loader2 spinner
- Exact truncation length for description column
- Tab scroll behavior when many categories exist

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Spec
- `CLAUDE.md` §Recommended Patterns — Column definitions, color codes for nutrition/FC%, tech stack constraints
- `.planning/PROJECT.md` — Core value, constraints, context
- `.planning/REQUIREMENTS.md` — All v1 requirements with phase mapping

### Domain Knowledge
- `docs/constitution/core-rules.md` — RULE-LANGUAGE-CONTRACT (all DB/code in English)
- `docs/constitution/engineering-rules.md` — Coding standards, commit rules

### Existing Implementation (verify & adapt)
- `apps/admin-panel/src/pages/menu/MenuPage.tsx` — Page layout, view toggle, category tabs, stats
- `apps/admin-panel/src/pages/menu/components/OwnerTable.tsx` — Table with inline editing, toggles, badges
- `apps/admin-panel/src/hooks/useMenuDishes.ts` — Data fetching hook for SALE dishes
- `apps/admin-panel/src/lib/supabase.ts` — Supabase client singleton

### Pattern References
- `apps/admin-panel/src/components/procurement/SupplierManager.tsx` — Table CRUD pattern
- `apps/admin-panel/src/App.tsx` — Route registration with lazy loading + RoleGuard

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **useMenuDishes hook**: Already fetches SALE dishes with categories, tags, nutrition. Returns `{ dishes, categories, isLoading, error, updateDish, refetch }`. May need to add L2 subcategory data if not already included.
- **OwnerTable component**: Already renders table with inline editing, toggles, color-coded badges. Needs verification that all columns from D-04 are present.
- **MenuPage**: Header with stats (total/available/featured/avg FC%), view toggle, category tabs, content area. Largely complete.
- **Supabase patterns**: `Promise.all()` for parallel queries, error in state, Map/Set for JS joins

### Established Patterns
- **Dark theme**: slate-900/950 bg, slate-100 text, emerald accent, amber warning, rose error
- **Table styling**: rounded-lg border-slate-800, text-[10px] uppercase headers, hover:bg-slate-800/30
- **Icons**: lucide-react exclusively (Check, X, Star, StarOff, Edit3, ChefHat, Eye, LayoutGrid, Table2)
- **Data fetching**: hooks with useState/useCallback/useEffect pattern, not React Query

### Integration Points
- Route at `/menu` already registered in App.tsx with RoleGuard(owner) and lazy loading
- AppShell sidebar already has Menu nav item
- Category data comes from `product_categories` table (L1→L2→L3 hierarchy)

</code_context>

<specifics>
## Specific Ideas

- L2 category divider rows should use the same visual weight as the existing category tab style — subtle, not heavy borders
- "No BOM" badges should be visually quiet (slate-700 bg, slate-400 text) — they'll become interactive CTA buttons when AI Chef is integrated in Phase 5
- Stats row at the top (total dishes, available, featured, avg FC%) is already implemented — verify accuracy

</specifics>

<deferred>
## Deferred Ideas

- **AI Chef integration on empty states** — "No BOM" badge becomes "Fill with AI Chef" button (Phase 5)
- **Expandable dish card with tech card / BOM / nutrition** — MC task 9fd1aaaf, separate from this phase
- **Analytics Brain agent** — MC task b8ca591f, separate initiative

</deferred>

---

*Phase: 01-data-foundation-owner-table*
*Context gathered: 2026-04-14*
