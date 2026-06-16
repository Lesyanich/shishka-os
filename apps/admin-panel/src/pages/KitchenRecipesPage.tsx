import { useCallback, useMemo, useState } from 'react'
import { ChefHat, Package, Loader2 } from 'lucide-react'
import { useMenuData } from '../hooks/useMenuData'
import { useMenuListEnrichment } from '../hooks/useMenuListEnrichment'
import { useFeedbackCounts } from '../hooks/useRecipeFeedback'
import { L1CookView } from './menu/components/L1CookView'
import { L2AssemblerView } from './menu/components/L2AssemblerView'
import { RecipeFeedbackPanel } from '../components/kitchen/RecipeFeedbackPanel'
import { CategoryTabs } from '../components/menu/shared'
import { TypeFilter, type TypeFilterValue } from '../components/menu/owner/TypeFilter'

type StationTab = 'l1-cook' | 'l2-assembler'

const STATION_TABS: { id: StationTab; label: string; icon: typeof ChefHat }[] = [
  { id: 'l1-cook', label: 'L1 Kitchen', icon: ChefHat },
  { id: 'l2-assembler', label: 'L2 Assembly', icon: Package },
]

export function KitchenRecipesPage() {
  const {
    items,
    categories,
    subcategories,
    childrenByParent,
    isLoading,
    error,
    reorderItems,
  } = useMenuData()

  const enrichment = useMenuListEnrichment(items, childrenByParent)

  // Station tab (L1 / L2)
  const [tab, setTab] = useState<StationTab>('l1-cook')

  // Category nav
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null)

  // Type filter — L1 defaults to PF (заготовки), L2 defaults to SALE
  const [typeFilter, setTypeFilter] = useState<TypeFilterValue>(
    tab === 'l1-cook' ? 'PF' : 'SALE',
  )

  // Reset type filter to sensible default on tab switch
  function handleTabChange(next: StationTab) {
    setTab(next)
    setTypeFilter(next === 'l1-cook' ? 'PF' : 'SALE')
    setSelectedCategory(null)
    setSelectedSubcategory(null)
  }

  // Feedback panel state
  const [commentDishId, setCommentDishId] = useState<string | null>(null)

  const commentDishName = useMemo(
    () => (commentDishId ? (items.find((i) => i.id === commentDishId)?.name ?? '') : ''),
    [commentDishId, items],
  )

  // Fetch comment counts for all visible items
  const dishIds = useMemo(() => items.map((i) => i.id), [items])
  const { counts: feedbackCounts, refetch: refetchCounts } = useFeedbackCounts(dishIds)

  // Subcategories of the currently-selected section
  const selectedSubcats = useMemo(
    () =>
      (selectedCategory ? subcategories.get(selectedCategory) ?? [] : []).map((s) => ({
        id: s.id,
        code: '',
        name: s.name,
      })),
    [selectedCategory, subcategories],
  )

  const handleCategorySelect = useCallback((id: string | null) => {
    setSelectedCategory(id)
    setSelectedSubcategory(null)
  }, [])

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
            onClick={() => handleTabChange(id)}
            className={[
              'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition',
              tab === id
                ? 'bg-surface-3 text-cream'
                : 'text-cream/50 hover:bg-surface-2 hover:text-cream/75',
            ].join(' ')}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Type filter + category nav */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <TypeFilter value={typeFilter} onChange={setTypeFilter} />
        </div>

        {categories.length > 0 && (
          <CategoryTabs
            categories={categories.map((c) => ({
              id: c.id,
              code: c.code,
              name: c.name,
            }))}
            selectedId={selectedCategory}
            onSelect={handleCategorySelect}
          />
        )}

        {selectedSubcats.length > 0 && (
          <CategoryTabs
            categories={selectedSubcats}
            selectedId={selectedSubcategory}
            onSelect={setSelectedSubcategory}
            allLabel="All subcategories"
          />
        )}
      </div>

      {/* Recipe view */}
      {tab === 'l1-cook' && (
        <L1CookView
          items={items}
          typeFilter={typeFilter}
          selectedCategory={selectedCategory}
          selectedSubcategory={selectedSubcategory}
          availableFilter={true}
          pfPackCardById={enrichment.pfPackCardById}
          recipeStatsById={enrichment.recipeStatsById}
          dishCardById={enrichment.dishCardById}
          childrenByParent={childrenByParent}
          staffMode
          feedbackCountById={feedbackCounts}
          onComment={setCommentDishId}
        />
      )}

      {tab === 'l2-assembler' && (
        <L2AssemblerView
          items={items}
          typeFilter={typeFilter}
          selectedCategory={selectedCategory}
          selectedSubcategory={selectedSubcategory}
          availableFilter={true}
          dishCardById={enrichment.dishCardById}
          componentsByDish={enrichment.componentsByDish}
          recipeStepsByDish={enrichment.recipeStepsByDish}
          modifierOptionsByDish={enrichment.modifierOptionsByDish}
          packagingByDish={enrichment.packagingByDish}
          onReorder={reorderItems}
          staffMode
          feedbackCountById={feedbackCounts}
          onComment={setCommentDishId}
        />
      )}

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
