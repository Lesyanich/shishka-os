import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RecipeStationPanel, type RecipeStation } from './RecipeStationPanel'
import { type TypeFilterValue } from '../../../components/menu/owner/TypeFilter'
import type { MenuItem, MenuBomChild } from '../../../hooks/useMenuData'
import type { MenuCategory, MenuSubcategory } from '../../../hooks/useMenuDishes'
import type { useMenuListEnrichment } from '../../../hooks/useMenuListEnrichment'

const TYPE_FILTERS: readonly TypeFilterValue[] = ['all', 'SALE', 'PF', 'MOD']

/**
 * Self-contained L1 Cook / L2 Assembler station experience. OWNS all station
 * filter state (type, search, availability, category, subcategory) via a
 * single `useSearchParams()` and renders {@link RecipeStationPanel}.
 *
 * Exposes NO per-control props — a parent only picks the `station` and
 * `mode`. This is the fix for the station-wiring drift bug: previously the
 * owner `/menu` and cook `/kitchen/recipes` pages each wired their own copy
 * of this filter state, so a new control (e.g. name-search) could land on
 * one page and be forgotten on the other. Now there is exactly one place to
 * wire a control.
 */
export interface StationRecipesViewProps {
  /** 'l1-cook' | 'l2-assembler' — CONTROLLED by parent. */
  station: RecipeStation
  mode: 'owner' | 'cook'
  items: MenuItem[]
  categoriesById: Map<string, MenuCategory>
  subcategories: Map<string, MenuSubcategory[]>
  childrenByParent: Map<string, MenuBomChild[]>
  enrichment: ReturnType<typeof useMenuListEnrichment>
  onReorder: (orderedIds: string[]) => Promise<{ ok: boolean; error?: string }>
  typeCounts?: { all: number; SALE: number; PF: number; MOD: number }
  /** Owner mode → opens the dish drawer. */
  onOpenDish?: (id: string) => void
  /** Cook mode → per-dish feedback comment counts. */
  feedbackCountById?: Map<string, number>
  /** Cook mode → opens the feedback panel for a dish. */
  onComment?: (id: string) => void
}

export function StationRecipesView({
  station,
  mode,
  items,
  categoriesById,
  subcategories,
  childrenByParent,
  enrichment,
  onReorder,
  typeCounts,
  onOpenDish,
  feedbackCountById,
  onComment,
}: StationRecipesViewProps) {
  const [searchParams, setSearchParams] = useSearchParams()

  // Setter that merges into existing query (omitting defaults for cleaner
  // URLs). Copied verbatim from MenuPage's `updateParam`.
  const updateParam = useCallback(
    (patch: Record<string, string | null>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === '') next.delete(k)
            else next.set(k, v)
          }
          return next
        },
        { replace: false },
      )
    },
    [setSearchParams],
  )

  // type (?type=) — L1 prep station defaults to PF (заготовки), L2 assembly
  // station defaults to SALE (final dishes).
  const defaultType: TypeFilterValue = station === 'l1-cook' ? 'PF' : 'SALE'
  const rawType = searchParams.get('type')
  const typeFilter: TypeFilterValue = (TYPE_FILTERS as readonly string[]).includes(rawType ?? '')
    ? (rawType as TypeFilterValue)
    : defaultType
  const setTypeFilter = useCallback(
    (t: TypeFilterValue) => updateParam({ type: t === defaultType ? null : t }),
    [updateParam, defaultType],
  )

  // search (?q=) — history replace so every keystroke doesn't spam the back button.
  const searchQuery = searchParams.get('q') ?? ''
  const setSearchQuery = useCallback(
    (q: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (q) next.set('q', q); else next.delete('q')
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  // availability (?available=) — STATION-CONDITIONAL. L1 absent → All (null).
  // L2 absent → Active-only (true), so deactivated dishes stay hidden unless
  // explicitly requested.
  const availableParam = searchParams.get('available')
  const availableFilter: boolean | null =
    station === 'l1-cook'
      ? availableParam === 'yes'
        ? true
        : availableParam === 'no'
          ? false
          : null
      : availableParam === 'all'
        ? null
        : availableParam === 'no'
          ? false
          : availableParam === 'yes'
            ? true
            : true
  const onAvailableFilter = useCallback(
    (v: boolean | null) =>
      updateParam({
        available:
          v === true ? 'yes' : v === false ? 'no' : station === 'l1-cook' ? null : 'all',
      }),
    [updateParam, station],
  )

  // category (?cat=) — first id only; compatible with useMenuFilters' multi-cat serialization.
  const catRaw = searchParams.get('cat')
  const selectedCategory = catRaw ? catRaw.split(',')[0] : null
  const setSelectedCategory = useCallback(
    (id: string | null) => {
      // Single setSearchParams call — mirrors MenuPage.setSelectedCategory exactly.
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (id) next.set('cat', id); else next.delete('cat')
          next.delete('available')
          next.delete('loyverse')
          next.delete('flags')
          next.delete('subcat')
          return next
        },
        { replace: false },
      )
    },
    [setSearchParams],
  )

  // subcategory (?subcat=)
  const selectedSubcategory = searchParams.get('subcat')
  const setSelectedSubcategory = useCallback(
    (id: string | null) => updateParam({ subcat: id }),
    [updateParam],
  )

  return (
    <RecipeStationPanel
      station={station}
      items={items}
      categoriesById={categoriesById}
      subcategories={subcategories}
      childrenByParent={childrenByParent}
      enrichment={enrichment}
      typeFilter={typeFilter}
      onTypeFilter={setTypeFilter}
      typeCounts={typeCounts}
      availableFilter={availableFilter}
      onAvailableFilter={onAvailableFilter}
      selectedCategory={selectedCategory}
      onSelectCategory={setSelectedCategory}
      selectedSubcategory={selectedSubcategory}
      onSelectSubcategory={setSelectedSubcategory}
      searchQuery={searchQuery}
      onSearchQuery={setSearchQuery}
      staffMode={mode === 'cook'}
      onOpenDish={mode === 'owner' ? onOpenDish : undefined}
      feedbackCountById={mode === 'cook' ? feedbackCountById : undefined}
      onComment={mode === 'cook' ? onComment : undefined}
      onReorder={onReorder}
    />
  )
}
