# Owner Power Filters for /menu

**Date:** 2026-05-20
**Status:** Draft (brainstorm)
**Parent audit:** MC 5a308946
**Driver:** CEO request — "хочу фильтровать только Available, посмотреть запушенные в Loyverse, multi-select категорий"

## Goal

Give Lesia (owner) fast, composable filters on the /menu page so she can answer in 1-2 clicks:

- "Which dishes are publicly available right now?"
- "Which dishes are pushed to Loyverse / never pushed / push failed?"
- "Show me everything in Manaish AND Salads at once" (multi-cat)
- "What's a draft (no price)?"
- "What's missing nutrition data / photo / BOM?"

Out of scope: bulk edit, saved presets, AI-token search, sorting. Each is a separate epic if she wants it.

## Current state (verified via Playwright 2026-05-20)

`apps/admin-panel/src/pages/menu/MenuPage.tsx` reads URL params:

```
view = owner | l1-cook | l2-assembler | customer
layout = table | gallery
type = ALL | SALE | PF | MOD       ← already drives tab strip
cat = <single uuid>                ← single-select; null = "All"
```

Header stats line uses the unfiltered `dishes` array (B2 bug) — must move to filtered set in this epic.

## Design

### Filter model (URL + state)

Add 4 new params, all optional, all multi-value (comma-separated UUIDs or enum tokens):

```
cat        = id1,id2,id3            ← was single, now multi
available  = yes | no                ← omit = both
loyverse   = synced | unsynced       ← omit = ignore
flags      = no-photo,no-kbju,no-bom,draft  ← chip-multiselect, OR within group
```

Logic: AND between groups, OR within a group.
Examples:
- `?cat=manaish,salads&available=yes` → (Manaish OR Salads) AND is_available
- `?loyverse=unsynced&flags=no-photo,no-kbju` → not pushed AND (missing photo OR missing kbju)

`?cat=` empty/absent = "All categories".

### URL ↔ UI contract

URL is source of truth. `useMenuFilters()` hook parses URL into a typed `MenuFilters` object, exposes setters that update URL via `useSearchParams`. No localStorage persistence in v1 — URL is share-link-friendly and sufficient.

### Component layout (above the result list)

```
[ + New dish ] [ AI Chef ]  [ Table | Gallery ]  [ Owner | L1 | L2 | Customer ]   ← unchanged top bar
─────────────────────────────────────────────────────────────────────────────
[ All 118 | Sale 58 | PF 49 | Mod 11 ]                                          ← type tabs unchanged
─────────────────────────────────────────────────────────────────────────────
[Categories ▼ 3] [Available ▼] [Loyverse ▼] [Flags ▼ 2]  •  Clear all          ← NEW filter bar
─────────────────────────────────────────────────────────────────────────────
58 dishes · 47 available · 1 featured · avg food cost 21.5%                    ← stats now reflect ACTIVE filter
─────────────────────────────────────────────────────────────────────────────
(rest of page — table / gallery)
```

Numbered badges on each chip show active-count. Clicking opens a popover with checkboxes (or pill multi-select for Categories).

### Filter chip behaviour

| Chip       | Type      | Options (v1) |
|------------|-----------|--------------|
| Categories | multi     | All from `product_categories` table, with live count per option |
| Available  | tri-state | Yes / No / Both (Both = no param) |
| Loyverse   | tri-state | Synced (loyverse_id IS NOT NULL) / Unsynced (IS NULL) / Both |
| Flags      | multi     | No photo / No KBJU / No BOM / Draft (price NULL) |

The existing single-row category strip is **replaced** by the Categories chip dropdown — that frees the long horizontal scroll real estate AND solves the "16 categories overflow" finding from the audit.

### Counts

Each filter option shows its live count under the **current** type-tab filter. Example: when `type=SALE` is active, Categories popover shows "Manaish 17 / Salads 4 / ...". When type changes, counts re-compute.

This adds compute cost but keeps the user oriented. Implementation: keep the existing `countsByCategory` memo, extend it for the new dimensions (available, loyverse, flags).

### Header stats fix (folds in B2)

Stats line = derived from `dishes.filter(matchesAllFilters)`. Drops the always-Sale bug. Free side-effect of this epic.

### What stays as today

- Type tabs (All/Sale/PF/Mod) — not multi-select; one bucket at a time matches product model.
- View toggle (Owner/L1/L2/Customer) — not part of filter system.
- Layout toggle (Table/Gallery) — not part of filter system.

## Database

No schema changes. Reads use existing columns:

- `nomenclature.is_available` (boolean, indexed)
- `nomenclature.loyverse_id` (text, nullable)
- `nomenclature.image_url` (text, nullable) — for has-photo
- `nomenclature.calories_kcal` (numeric, nullable) — for has-kbju
- `nomenclature.price` (numeric, nullable) — for draft
- `nomenclature.category_id` → `product_categories.id` — for cat
- `bom_structures.parent_sku` — for has-bom (existing join already in useMenu)

## Files affected

| File | Change |
|------|--------|
| `apps/admin-panel/src/pages/menu/MenuPage.tsx` | Replace single `selectedCategory` state with `MenuFilters` object; replace strip render with FilterBar; pass filtered set everywhere; recompute stats from filtered set |
| **NEW** `apps/admin-panel/src/pages/menu/components/FilterBar.tsx` | The chip-bar with 4 popovers |
| **NEW** `apps/admin-panel/src/pages/menu/components/FilterChip.tsx` | Single popover chip primitive (label, count, options, on-change) |
| **NEW** `apps/admin-panel/src/pages/menu/hooks/useMenuFilters.ts` | URL ↔ filters parser/serializer |
| `apps/admin-panel/src/hooks/useMenu.ts` (or equiv) | Apply filters in the query / in-memory predicate |
| Test files: `MenuPage.test.ts`, new `FilterBar.test.tsx`, `useMenuFilters.test.ts` | Unit + integration |

## Rollout

Single PR. Behind no flag — additive UX with safe fallback (no URL params = today's behaviour).

## Out of scope (named to prevent scope creep)

- Bulk-edit actions on filtered set (mass toggle is_available) — needs separate UX
- Saved filter presets — comes after we see what Lesia uses
- Sort controls (by price / margin / cost) — separate epic
- AI-search bar (`available:yes margin:<20`) — much later
- Filter on derived metrics (`food_cost_pct > 40%`, `margin_pct < 20%`) — compute-heavy, deferred
- Replacing inline expand in Owner table — that's Epic 2 (Drawer redesign)

## Open questions resolved by defaults

| Q | Default |
|---|---------|
| Multi-cat AND vs OR | OR within Categories (matches user mental model "show Manaish + Salads") |
| Default Available filter | Both (don't hide drafts in Owner — they should be visible to fix them) |
| Persist across navigation | URL only; no localStorage in v1 |
| Mobile/narrow viewport | Chips wrap; popover becomes bottom-sheet. Not designed in detail v1 |
| Customer view | Filter bar HIDDEN in Customer view (customer sees curated list, not power filters) |

## Risk register

| Risk | Mitigation |
|------|------------|
| Multi-cat URL list gets long → ugly share links | Use short slug instead of uuid (`?cat=manaish,salads`) — requires `product_categories.slug` column or join by name |
| Counts recomputation perf on 118-dish set | Negligible — already memoized; in-memory filter on 118 rows |
| URL backward-compat — old links `?cat=<uuid>` should still work | Single-value reader treats it as multi-of-1 — no breakage |
| Filter chip on small screen overflow | Wrap to 2 rows, ok for v1 |

## Side-effects on already-spawned MC tasks

- **B2 (header stats)** [18ab7fe9] — **subsumed** by this epic, can close as duplicate
- **Audit finding #3 (hide drafts in Customer)** [1104cf75] — separate fix; this epic doesn't touch Customer view
- **Audit finding #5 (column toggle)** [20e795b4] — separate UI surface (columns ≠ filters)

After this epic merges, mark 18ab7fe9 as `done` with link to this PR.
