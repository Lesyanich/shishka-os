import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChefHat, Package, Loader2 } from 'lucide-react'
import { useMenuData } from '../hooks/useMenuData'
import { useMenuListEnrichment } from '../hooks/useMenuListEnrichment'
import { useFeedbackCounts } from '../hooks/useRecipeFeedback'
import {
  RecipeStationPanel,
  type RecipeStation,
} from './menu/components/RecipeStationPanel'
import { RecipeFeedbackPanel } from '../components/kitchen/RecipeFeedbackPanel'
import type { TypeFilterValue } from '../components/menu/owner/TypeFilter'

const STATION_TABS: { id: RecipeStation; label: string; icon: typeof ChefHat }[] = [
  { id: 'l1-cook', label: 'L1 Kitchen', icon: ChefHat },
  { id: 'l2-assembler', label: 'L2 Assembly', icon: Package },
]

// Sensible per-station defaults (match the owner's /menu views):
//   L1 prep station → PF (заготовки), show All availability
//   L2 assembly station → SALE (final dishes), Active-only
function defaultType(station: RecipeStation): TypeFilterValue {
  return station === 'l1-cook' ? 'PF' : 'SALE'
}
function defaultAvailable(station: RecipeStation): boolean | null {
  return station === 'l1-cook' ? null : true
}

/**
 * Cook-facing recipe stations (`/kitchen/recipes`, role: cook). Renders the same
 * {@link RecipeStationPanel} as the owner's `/menu` L1/L2 views, but in
 * `staffMode` — no cost/margin, read-only, with a per-dish feedback button.
 */
export function KitchenRecipesPage() {
  const {
    items,
    categoriesById,
    subcategories,
    childrenByParent,
    isLoading,
    error,
    reorderItems,
  } = useMenuData()

  const enrichment = useMenuListEnrichment(items, childrenByParent)

  // Deep-link params (?dish={product_code}&station=l1-cook|l2-assembler) — a task
  // in the tracker can link straight to a dish's recipe on the right station tab.
  const [searchParams] = useSearchParams()
  const dishParam = searchParams.get('dish')
  const initialStation: RecipeStation =
    searchParams.get('station') === 'l2-assembler' ? 'l2-assembler' : 'l1-cook'

  // Station tab (L1 / L2)
  const [station, setStation] = useState<RecipeStation>(initialStation)

  // Filters
  const [typeFilter, setTypeFilter] = useState<TypeFilterValue>(defaultType(initialStation))
  const [availableFilter, setAvailableFilter] = useState<boolean | null>(
    defaultAvailable(initialStation),
  )
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // When deep-linked to a specific dish, surface it: show All availability and
  // narrow to the dish's type + section so its card (with steps) is at the top.
  const appliedDishRef = useRef(false)
  useEffect(() => {
    if (appliedDishRef.current) return
    if (!dishParam || items.length === 0) return
    appliedDishRef.current = true
    const item = items.find((i) => i.product_code === dishParam)
    if (!item) return
    setTypeFilter(item.kind as TypeFilterValue)
    setAvailableFilter(null)
    setSelectedCategory(item.section_id ?? item.category_id ?? null)
    setSelectedSubcategory(null)
  }, [dishParam, items])

  // Reset filters to station-appropriate defaults on tab switch.
  function handleStationChange(next: RecipeStation) {
    setStation(next)
    setTypeFilter(defaultType(next))
    setAvailableFilter(defaultAvailable(next))
    setSelectedCategory(null)
    setSelectedSubcategory(null)
    setSearchQuery('')
  }

  const handleCategorySelect = useCallback((id: string | null) => {
    setSelectedCategory(id)
    setSelectedSubcategory(null)
  }, [])

  // Feedback panel state
  const [commentDishId, setCommentDishId] = useState<string | null>(null)
  const commentDishName = useMemo(
    () => (commentDishId ? (items.find((i) => i.id === commentDishId)?.name ?? '') : ''),
    [commentDishId, items],
  )

  // Fetch comment counts for all items
  const dishIds = useMemo(() => items.map((i) => i.id), [items])
  const { counts: feedbackCounts, refetch: refetchCounts } = useFeedbackCounts(dishIds)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-cream/40" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-brick-soft/30 bg-brick-soft/10 p-4 text-sm text-brick-soft">
        Failed to load recipes: {error}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Station tabs */}
      <div className="flex items-center gap-2">
        {STATION_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => handleStationChange(id)}
            className={[
              'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition',
              station === id
                ? 'bg-surface-3 text-cream'
                : 'text-cream/50 hover:bg-surface-2 hover:text-cream/75',
            ].join(' ')}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Shared station panel (cook mode) */}
      <RecipeStationPanel
        station={station}
        items={items}
        categoriesById={categoriesById}
        subcategories={subcategories}
        childrenByParent={childrenByParent}
        enrichment={enrichment}
        typeFilter={typeFilter}
        onTypeFilter={setTypeFilter}
        availableFilter={availableFilter}
        onAvailableFilter={setAvailableFilter}
        selectedCategory={selectedCategory}
        onSelectCategory={handleCategorySelect}
        selectedSubcategory={selectedSubcategory}
        onSelectSubcategory={setSelectedSubcategory}
        searchQuery={searchQuery}
        onSearchQuery={setSearchQuery}
        onReorder={reorderItems}
        staffMode
        feedbackCountById={feedbackCounts}
        onComment={setCommentDishId}
      />

      {/* Feedback panel (slide-in) */}
      {commentDishId && (
        <RecipeFeedbackPanel
          dishId={commentDishId}
          dishName={commentDishName}
          onClose={() => setCommentDishId(null)}
          onCountChange={refetchCounts}
        />
      )}
    </div>
  )
}
