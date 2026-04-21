import { useMemo, useState } from 'react'
import { Eye, Table2, LayoutGrid, Loader2, ChefHat, Sparkles, Plus } from 'lucide-react'
import { useMenuData } from '../../hooks/useMenuData'
import { useInlineUpdate } from '../../hooks/useInlineUpdate'
import { OwnerTable } from './components/OwnerTable'
import { OwnerGallery } from './components/OwnerGallery'
import { CustomerPreview } from './components/CustomerPreview'
import { NewDishModal } from './components/NewDishModal'
import { ChefChatPanel } from '../../components/chef/ChefChatPanel'
import { TypeFilter, type TypeFilterValue } from '../../components/menu/owner/TypeFilter'
import { DetailDrawer } from '../../components/menu/owner/DetailDrawer'
import { CategoryTabs } from '../../components/menu/shared'

type ViewMode = 'owner' | 'customer'
type OwnerLayout = 'table' | 'gallery'

export function MenuPage() {
  const {
    items,
    dishes,
    categories,
    subcategories,
    childrenByParent,
    dualTypeIds,
    isLoading,
    error,
    updateItem,
    refetch,
  } = useMenuData()
  const inlineUpdate = useInlineUpdate(updateItem)
  const [view, setView] = useState<ViewMode>('owner')
  const [ownerLayout, setOwnerLayout] = useState<OwnerLayout>('table')
  const [typeFilter, setTypeFilter] = useState<TypeFilterValue>('SALE')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [chefOpen, setChefOpen] = useState(false)
  const [newDishOpen, setNewDishOpen] = useState(false)
  const [drawerItemId, setDrawerItemId] = useState<string | null>(null)
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null)

  // Items scoped to current type filter (used for category counts + OwnerTable).
  // Dual-type items appear in BOTH filter buckets per product-design spec.
  const typeFilteredItems = useMemo(() => {
    if (typeFilter === 'all') return items
    return items.filter((i) => i.kind === typeFilter || (i.isDualType && typeFilter === 'PF'))
  }, [items, typeFilter])

  // Counts per category (null key = "All") within the active type filter
  const categoryCounts = useMemo(() => {
    const counts = new Map<string | null, number>()
    counts.set(null, typeFilteredItems.length)
    for (const item of typeFilteredItems) {
      if (!item.category_id) continue
      counts.set(item.category_id, (counts.get(item.category_id) ?? 0) + 1)
    }
    return counts
  }, [typeFilteredItems])

  // Counts per type filter bucket (drives pill counters)
  const typeCounts = useMemo(() => {
    let all = 0
    let sale = 0
    let pf = 0
    let mod = 0
    for (const item of items) {
      all += 1
      if (item.kind === 'SALE') sale += 1
      if (item.kind === 'PF' || item.isDualType) pf += 1
      if (item.kind === 'MOD') mod += 1
    }
    return { all, SALE: sale, PF: pf, MOD: mod }
  }, [items])

  const handleDishCreated = async (dishId: string) => {
    setJustCreatedId(dishId)
    await refetch()
    // Snap back to owner/table so the new row + chevron is visible
    setView('owner')
    setOwnerLayout('table')
    setSelectedCategory(null)
  }

  // Stats
  const totalDishes = dishes.length
  const availableCount = dishes.filter((d) => d.is_available).length
  const featuredCount = dishes.filter((d) => d.is_featured).length
  const avgFoodCost =
    dishes.reduce((sum, d) => {
      if (!d.price || !d.cost_per_unit) return sum
      return sum + (d.cost_per_unit / d.price) * 100
    }, 0) / (dishes.filter((d) => d.price && d.cost_per_unit).length || 1)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Brand mark */}
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border bg-royal-green text-cream"
            style={{
              borderColor: 'var(--color-forest-soft)',
              fontFamily: 'var(--font-display-sc)',
              fontWeight: 700,
              fontSize: '14px',
              lineHeight: 1,
            }}
            aria-hidden
          >
            Ш
          </div>
          <span
            className="text-cream"
            style={{
              fontFamily: 'var(--font-display-sc)',
              fontWeight: 700,
              letterSpacing: '0.14em',
              fontSize: '13px',
            }}
          >
            SHISHKA
          </span>
          <span className="text-faint" aria-hidden>/</span>
          <div>
            <h1
              className="text-2xl text-cream"
              style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}
            >
              Menu
            </h1>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
              {totalDishes} dishes &middot; {availableCount} available &middot; {featuredCount} featured &middot; avg fc {avgFoodCost.toFixed(1)}%
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* New Dish button */}
          <button
            onClick={() => setNewDishOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-brick bg-brick px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brick-soft hover:border-brick-soft"
            title="Create new dish"
          >
            <Plus className="h-3.5 w-3.5" />
            New dish
          </button>

          {/* AI Chef button */}
          <button
            onClick={() => setChefOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-cream/15 bg-transparent px-3 py-1.5 text-xs font-medium text-cream transition hover:border-cream/30 hover:bg-surface-3"
            title="Open AI Chef"
          >
            <Sparkles className="h-3.5 w-3.5" />
            AI Chef
          </button>

          {/* Owner layout toggle */}
          {view === 'owner' && (
            <div className="flex rounded-lg border border-surface-3 bg-surface-1 p-0.5">
              <button
                onClick={() => setOwnerLayout('table')}
                className={`flex items-center rounded-md p-1.5 transition ${
                  ownerLayout === 'table'
                    ? 'bg-surface-3 text-cream'
                    : 'text-muted hover:text-cream'
                }`}
                title="Table view"
              >
                <Table2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setOwnerLayout('gallery')}
                className={`flex items-center rounded-md p-1.5 transition ${
                  ownerLayout === 'gallery'
                    ? 'bg-surface-3 text-cream'
                    : 'text-muted hover:text-cream'
                }`}
                title="Gallery view"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* View toggle */}
          <div className="flex rounded-lg border border-surface-3 bg-surface-1 p-0.5">
            <button
              onClick={() => setView('owner')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                view === 'owner'
                  ? 'bg-surface-3 text-cream'
                  : 'text-muted hover:text-cream'
              }`}
            >
              Owner
            </button>
            <button
              onClick={() => setView('customer')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                view === 'customer'
                  ? 'bg-surface-3 text-cream'
                  : 'text-muted hover:text-cream'
              }`}
            >
              <Eye className="h-3.5 w-3.5" />
              Customer
            </button>
          </div>
        </div>
      </div>

      {/* Type filter + Category tabs */}
      {view === 'owner' && (
        <div className="flex flex-wrap items-center gap-3">
          <TypeFilter value={typeFilter} onChange={setTypeFilter} counts={typeCounts} />
          {categories.length > 0 && (
            <div className="flex-1 min-w-0">
              <CategoryTabs
                categories={categories}
                selectedId={selectedCategory}
                onSelect={setSelectedCategory}
                counts={categoryCounts}
              />
            </div>
          )}
        </div>
      )}
      {view === 'customer' && categories.length > 0 && (
        <CategoryTabs
          categories={categories}
          selectedId={selectedCategory}
          onSelect={setSelectedCategory}
        />
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-32 text-xs text-muted">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-forest-soft" />
          Loading menu...
        </div>
      ) : error ? (
        <div className="rounded-lg border border-brick/40 bg-brick/10 p-4 text-sm text-brick-soft">
          Failed to load menu: {error}
        </div>
      ) : dishes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-muted">
          <ChefHat className="mb-3 h-10 w-10 text-faint" />
          <p className="text-sm font-medium text-cream">No dishes yet</p>
          <p className="mt-1 text-xs text-faint">
            Add SALE-type dishes in the nomenclature to see them here.
          </p>
        </div>
      ) : view === 'owner' && ownerLayout === 'table' ? (
        <OwnerTable
          items={typeFilteredItems}
          typeFilter={typeFilter}
          selectedCategory={selectedCategory}
          subcategories={subcategories}
          childrenByParent={childrenByParent}
          dualTypeIds={dualTypeIds}
          onUpdate={inlineUpdate.commit}
          isFailed={inlineUpdate.isFailed}
          errorFor={inlineUpdate.errorFor}
          onOpenDrawer={setDrawerItemId}
          autoExpandId={justCreatedId}
        />
      ) : view === 'owner' && ownerLayout === 'gallery' ? (
        <OwnerGallery
          dishes={dishes}
          selectedCategory={selectedCategory}
          onUpdate={updateItem}
        />
      ) : (
        <CustomerPreview
          dishes={dishes}
          categories={categories}
          selectedCategory={selectedCategory}
        />
      )}

      {/* New Dish modal */}
      <NewDishModal
        open={newDishOpen}
        onClose={() => setNewDishOpen(false)}
        onCreated={handleDishCreated}
      />

      {/* AI Chef slide-out panel */}
      <ChefChatPanel open={chefOpen} onClose={() => setChefOpen(false)} />

      {/* Detail drawer — slide-in right panel */}
      <DetailDrawer
        item={items.find((i) => i.id === drawerItemId) ?? null}
        onClose={() => setDrawerItemId(null)}
        onToggleAvailable={async (id, next) => {
          await inlineUpdate.commit(id, { is_available: next })
        }}
        returnFocusToId={drawerItemId}
      />
    </div>
  )
}
