---
phase: quick-260703-0mc
plan: 01
subsystem: ui
tags: [react, react-router, menu, kitchen, url-state, refactor]

# Dependency graph
requires:
  - phase: quick-260702-xao
    provides: name-search (?q=) wired into cook /kitchen/recipes view — the drift bug this plan fixes
provides:
  - StationRecipesView component — single self-contained L1/L2 station experience owning all filter state via URL params
  - MenuPage owner L1/L2 branches collapsed into one delegate
  - KitchenRecipesPage fully URL-driven (station + filters), delegating to StationRecipesView
affects: [menu, kitchen-recipes, future station-control additions]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Self-contained filter-owning component pattern: a shared view component owns ALL of its filter state internally via useSearchParams and exposes zero per-control props to its parent, so a parent can never forget to wire a new control to one of two call sites"

key-files:
  created:
    - apps/admin-panel/src/pages/menu/components/StationRecipesView.tsx
    - apps/admin-panel/src/pages/menu/components/StationRecipesView.test.ts
  modified:
    - apps/admin-panel/src/pages/menu/MenuPage.tsx
    - apps/admin-panel/src/pages/KitchenRecipesPage.tsx

key-decisions:
  - "StationRecipesView owns ALL L1/L2 filter state (type/q/available/cat/subcat) via a single useSearchParams() call, exposing no per-control props — per CEO decision to make it structurally impossible for a future control to be wired into only one of the two call sites"
  - "KitchenRecipesPage's station tab and deep-link ?dish= effect were made fully URL-driven (previously local useState) so StationRecipesView's URL-param-based defaults apply uniformly on both routes"

patterns-established:
  - "Pattern: shared filter-state component (StationRecipesView) — future controls added to the L1/L2 station experience are wired ONCE in this file and automatically appear on both /menu?view=l1-cook|l2-assembler and /kitchen/recipes"

requirements-completed: [DRIFT-FIX-STATIONVIEW]

# Metrics
duration: 15min
completed: 2026-07-03
---

# Quick Task 260703-0mc: Extract shared StationRecipesView component Summary

**New `StationRecipesView` component collapses two divergent L1/L2 filter-state wirings (MenuPage + KitchenRecipesPage) into one URL-param-owning component, eliminating the station-wiring drift bug class.**

## Performance

- **Duration:** ~15 min (read/plan-review + 3 task commits ~4 min apart)
- **Started:** 2026-07-02T17:30:00Z
- **Completed:** 2026-07-02T17:38:27Z
- **Tasks:** 3 completed
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- Created `StationRecipesView.tsx` — a self-contained component that owns type/search/availability/category/subcategory filter state via a single `useSearchParams()`, replicating MenuPage's exact prior URL-param semantics (station-conditional availability defaults, default type per station, comma-list category parsing, etc.)
- Collapsed MenuPage's two duplicate `<RecipeStationPanel>` blocks (l1-cook / l2-assembler) into a single `<StationRecipesView mode="owner">` branch, removing ~60 lines of now-dead exclusive state
- Rewired KitchenRecipesPage so station and all filters are fully URL-driven (`?station=`), removing local `useState` filter duplication and translating the `?dish=` deep-link into URL params once via the existing `appliedDishRef` guard

## Task Commits

Each task was committed atomically:

1. **Task 1: Create self-contained StationRecipesView component** - `833ba76` (refactor)
2. **Task 2: Rewire MenuPage owner L1/L2 branches to StationRecipesView** - `33636f4` (refactor)
3. **Task 3: Rewire KitchenRecipesPage to URL-driven station + StationRecipesView** - `b201077` (refactor)

**Plan metadata:** committed separately by orchestrator (SUMMARY.md/STATE.md not committed by this agent per constraints)

_Note: No TDD tasks in this plan — pure structural refactor with existing smoke-test convention._

## Files Created/Modified
- `apps/admin-panel/src/pages/menu/components/StationRecipesView.tsx` - New component; owns L1/L2 filter state (type/q/available/cat/subcat) via URL params, renders `RecipeStationPanel` with all controls wired internally
- `apps/admin-panel/src/pages/menu/components/StationRecipesView.test.ts` - Smoke export test (copies RecipeStationPanel.test.ts's supabase mock block verbatim)
- `apps/admin-panel/src/pages/menu/MenuPage.tsx` - Both L1/L2 branches collapsed into one `<StationRecipesView mode="owner">`; dead exclusive state (`l2AvailableFilter`, `setL2AvailableFilter`, `setAvailableFilter`, `availableParam`, `selectedSubcategory`, `setSelectedSubcategory`) removed
- `apps/admin-panel/src/pages/KitchenRecipesPage.tsx` - Station derived from `?station=`; all local filter `useState` + `defaultType`/`defaultAvailable`/`handleCategorySelect` removed; deep-link effect rewritten as a single functional `setSearchParams` call reading station from `prev` (keeps `searchParams` out of the effect's dependency array, satisfying `react-hooks/exhaustive-deps`); renders `<StationRecipesView mode="cook">`

## Decisions Made
- Followed the plan's `<current_semantics>` block verbatim for StationRecipesView's URL-param logic — no interpretation needed, MenuPage's prior behavior was transcribed exactly (station-conditional availability, defaultType-omission-from-URL, etc.)
- Used the functional-updater form of `setSearchParams` in KitchenRecipesPage's deep-link effect and station-tab writer (per plan's critical hint) to avoid an eslint `react-hooks/exhaustive-deps` error while keeping `searchParams` out of dependency arrays

## Deviations from Plan

None - plan executed exactly as written. All grep verification assertions, `tsc -b`, `npm run build`, and the targeted test suite (`taskLinks StationRecipesView RecipeStationPanel MenuPage` — 4 files, 7 tests) passed clean on first attempt.

## Issues Encountered

During drafting of KitchenRecipesPage.tsx a placeholder call to a non-existent `useSearchParamsFreeState()` hook was introduced by mistake for the feedback panel's `commentDishId` local state (which the plan explicitly says to keep as plain local state, not URL-driven). Caught immediately via `tsc -b` before verification and fixed in the same task by importing `useState` from React and using `useState<string | null>(null)`, matching original behavior exactly. No commit was made with the broken code — fixed before Task 3's commit.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `StationRecipesView` is now the single point of wiring for any future L1/L2 station control (e.g. new filter chips, bulk actions) — both `/menu?view=l1-cook|l2-assembler` and `/kitchen/recipes` automatically inherit it
- `RecipeStationPanel`, `L1CookView`, and `L2AssemblerView` were untouched, as required — no risk introduced to their internals
- No blockers for future menu/kitchen work

---
*Phase: quick-260703-0mc*
*Completed: 2026-07-03*

## Self-Check: PASSED

All created/modified files verified present on disk; all 3 task commits (833ba76, 33636f4, b201077) verified present in git log.
