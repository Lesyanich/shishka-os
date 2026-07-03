import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChefHat, Package, Loader2 } from 'lucide-react'
import { useMenuData } from '../hooks/useMenuData'
import { useMenuListEnrichment } from '../hooks/useMenuListEnrichment'
import { useFeedbackCounts } from '../hooks/useRecipeFeedback'
import { type RecipeStation } from './menu/components/RecipeStationPanel'
import { StationRecipesView } from './menu/components/StationRecipesView'
import { RecipeFeedbackPanel } from '../components/kitchen/RecipeFeedbackPanel'

const STATION_TABS: { id: RecipeStation; label: string; icon: typeof ChefHat }[] = [
  { id: 'l1-cook', label: 'L1 Kitchen', icon: ChefHat },
  { id: 'l2-assembler', label: 'L2 Assembly', icon: Package },
]

/**
 * Cook-facing recipe stations (`/kitchen/recipes`, role: cook). Renders the same
 * {@link StationRecipesView} as the owner's `/menu` L1/L2 views, but in
 * `mode="cook"` — no cost/margin, read-only, with a per-dish feedback button.
 * Station + all filters are URL-driven, delegated entirely to StationRecipesView.
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
  const [searchParams, setSearchParams] = useSearchParams()
  const dishParam = searchParams.get('dish')

  // Station tab (L1 / L2) — URL-driven; StationRecipesView reads/writes the
  // same station-appropriate ?type/?available defaults from the URL.
  const station: RecipeStation =
    searchParams.get('station') === 'l2-assembler' ? 'l2-assembler' : 'l1-cook'

  // When deep-linked to a specific dish, surface it: show All availability and
  // narrow to the dish's type + section so its card (with steps) is at the top.
  // Translated into URL params ONCE via the appliedDishRef guard; StationRecipesView
  // then reads these params and renders the surfaced dish.
  const appliedDishRef = useRef(false)
  useEffect(() => {
    if (appliedDishRef.current) return
    if (!dishParam || items.length === 0) return
    appliedDishRef.current = true
    const item = items.find((i) => i.product_code === dishParam)
    if (!item) return
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        const st = prev.get('station') === 'l2-assembler' ? 'l2-assembler' : 'l1-cook'
        next.set('type', item.kind)
        const cat = item.section_id ?? item.category_id
        if (cat) next.set('cat', cat); else next.delete('cat')
        next.delete('subcat')
        if (st === 'l1-cook') next.delete('available')
        else next.set('available', 'all')
        return next
      },
      { replace: true },
    )
  }, [dishParam, items, setSearchParams])

  // Station tab strip writer — URL-driven. No filter resets here:
  // StationRecipesView recomputes station-appropriate defaults from URL
  // params automatically (absent ?type / ?available fall back to the
  // station default).
  function handleStationChange(next: RecipeStation) {
    setSearchParams(
      (prev) => {
        const nextParams = new URLSearchParams(prev)
        if (next === 'l1-cook') nextParams.delete('station')
        else nextParams.set('station', next)
        return nextParams
      },
      { replace: false },
    )
  }

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

      {/* Shared station experience (cook mode) — all filter state URL-driven internally. */}
      <StationRecipesView
        station={station}
        mode="cook"
        items={items}
        categoriesById={categoriesById}
        subcategories={subcategories}
        childrenByParent={childrenByParent}
        enrichment={enrichment}
        onReorder={reorderItems}
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
