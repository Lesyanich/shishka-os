import { useMemo } from 'react'
import type { MenuItem, MenuBomChild } from '../../../hooks/useMenuData'
import type { MenuCategory, MenuSubcategory } from '../../../hooks/useMenuDishes'
import type { useMenuListEnrichment } from '../../../hooks/useMenuListEnrichment'
import {
  TypeFilter,
  matchesType,
  type TypeFilterValue,
} from '../../../components/menu/owner/TypeFilter'
import { CategoryTabs } from '../../../components/menu/shared'
import { L1CookView } from './L1CookView'
import { L2AssemblerView } from './L2AssemblerView'

type Enrichment = ReturnType<typeof useMenuListEnrichment>

export type RecipeStation = 'l1-cook' | 'l2-assembler'

/**
 * Shared L1 Cook / L2 Assembly station panel — the single implementation behind
 * BOTH the owner's `/menu?view=l1-cook|l2-assembler` and the cook's
 * `/kitchen/recipes`. The two routes differ only by role props:
 *   • owner  → editable, financials shown, opens the dish drawer
 *   • cook   → `staffMode` (no cost/margin), read-only, feedback button
 *
 * Category chips are data-driven from the items actually present in the current
 * type filter (`presentCategories`), so the L1 prep station shows PF prep groups
 * (Doughs & Bread, Cooked Components, …) instead of empty SALE menu sections.
 */
export interface RecipeStationPanelProps {
  station: RecipeStation
  items: MenuItem[]
  /** Every category by id (all levels) — resolves a section_id to its chip. */
  categoriesById: Map<string, MenuCategory>
  subcategories: Map<string, MenuSubcategory[]>
  childrenByParent: Map<string, MenuBomChild[]>
  enrichment: Enrichment
  typeFilter: TypeFilterValue
  onTypeFilter: (t: TypeFilterValue) => void
  typeCounts?: { all: number; SALE: number; PF: number; MOD: number }
  /** null = all, true = active only, false = inactive only */
  availableFilter: boolean | null
  onAvailableFilter: (v: boolean | null) => void
  selectedCategory: string | null
  onSelectCategory: (id: string | null) => void
  selectedSubcategory: string | null
  onSelectSubcategory: (id: string | null) => void
  /** Cook mode: hide cost/margin, disable editing, show comment button. */
  staffMode?: boolean
  onOpenDish?: (id: string) => void
  onReorder: (orderedIds: string[]) => Promise<{ ok: boolean; error?: string }>
  feedbackCountById?: Map<string, number>
  onComment?: (id: string) => void
}

const AVAILABILITY_OPTIONS: { value: boolean | null; label: string }[] = [
  { value: true, label: 'Active' },
  { value: false, label: 'Inactive' },
  { value: null, label: 'All' },
]

export function RecipeStationPanel({
  station,
  items,
  categoriesById,
  subcategories,
  childrenByParent,
  enrichment,
  typeFilter,
  onTypeFilter,
  typeCounts,
  availableFilter,
  onAvailableFilter,
  selectedCategory,
  onSelectCategory,
  selectedSubcategory,
  onSelectSubcategory,
  staffMode,
  onOpenDish,
  onReorder,
  feedbackCountById,
  onComment,
}: RecipeStationPanelProps) {
  // Items in the current type filter — drives both the chips and their counts.
  const typeFilteredItems = useMemo(
    () => items.filter((i) => matchesType(i, typeFilter)),
    [items, typeFilter],
  )

  // Counts per SECTION (null key = "All") within the active type filter.
  const categoryCounts = useMemo(() => {
    const counts = new Map<string | null, number>()
    counts.set(null, typeFilteredItems.length)
    for (const item of typeFilteredItems) {
      const sec = item.section_id ?? item.category_id
      if (!sec) continue
      counts.set(sec, (counts.get(sec) ?? 0) + 1)
    }
    return counts
  }, [typeFilteredItems])

  // Data-driven chips: the sections the present items roll up to, resolved to
  // their display category. Empty SALE-only chips drop out; PF/MOD prep groups
  // that had no static chip now appear. Self-correcting per type filter.
  const presentCategories = useMemo<MenuCategory[]>(() => {
    const seen = new Set<string>()
    const out: MenuCategory[] = []
    for (const item of typeFilteredItems) {
      const secId = item.section_id ?? item.category_id
      if (!secId || seen.has(secId)) continue
      seen.add(secId)
      out.push(
        categoriesById.get(secId) ?? {
          id: secId,
          code: '',
          name: item.category_name ?? 'Uncategorized',
          sort_order: 9999,
        },
      )
    }
    return out.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
  }, [typeFilteredItems, categoriesById])

  // Subcategories of the selected section, shaped for CategoryTabs.
  const selectedSubcats = useMemo(
    () =>
      (selectedCategory ? subcategories.get(selectedCategory) ?? [] : []).map((s) => ({
        id: s.id,
        code: '',
        name: s.name,
      })),
    [selectedCategory, subcategories],
  )

  return (
    <div className="space-y-2">
      {/* Controls: type filter + availability toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <TypeFilter value={typeFilter} onChange={onTypeFilter} counts={typeCounts} />
        <div className="flex rounded-lg border border-surface-3 bg-surface-1 p-0.5">
          {AVAILABILITY_OPTIONS.map(({ value, label }) => (
            <button
              key={label}
              type="button"
              onClick={() => onAvailableFilter(value)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                availableFilter === value
                  ? 'bg-surface-3 text-cream'
                  : 'text-cream/50 hover:text-cream/80'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Data-driven section chips */}
      {presentCategories.length > 0 && (
        <CategoryTabs
          categories={presentCategories}
          selectedId={selectedCategory}
          onSelect={onSelectCategory}
          counts={categoryCounts}
        />
      )}

      {/* Drill-down: subcategories of the selected section */}
      {selectedSubcats.length > 0 && (
        <CategoryTabs
          categories={selectedSubcats}
          selectedId={selectedSubcategory}
          onSelect={onSelectSubcategory}
        />
      )}

      {/* Station view */}
      {station === 'l1-cook' ? (
        <L1CookView
          items={items}
          typeFilter={typeFilter}
          selectedCategory={selectedCategory}
          selectedSubcategory={selectedSubcategory}
          availableFilter={availableFilter}
          pfPackCardById={enrichment.pfPackCardById}
          recipeStatsById={enrichment.recipeStatsById}
          dishCardById={enrichment.dishCardById}
          childrenByParent={childrenByParent}
          recipeStepsByDish={enrichment.recipeStepsByDish}
          onOpenDish={onOpenDish}
          staffMode={staffMode}
          feedbackCountById={feedbackCountById}
          onComment={onComment}
        />
      ) : (
        <L2AssemblerView
          items={items}
          typeFilter={typeFilter}
          selectedCategory={selectedCategory}
          selectedSubcategory={selectedSubcategory}
          availableFilter={availableFilter}
          dishCardById={enrichment.dishCardById}
          componentsByDish={enrichment.componentsByDish}
          recipeStepsByDish={enrichment.recipeStepsByDish}
          modifierOptionsByDish={enrichment.modifierOptionsByDish}
          packagingByDish={enrichment.packagingByDish}
          onOpenDish={onOpenDish}
          onReorder={onReorder}
          staffMode={staffMode}
          feedbackCountById={feedbackCountById}
          onComment={onComment}
        />
      )}
    </div>
  )
}
