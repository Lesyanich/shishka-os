import { useCallback, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
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

const VIEW_MODES: readonly ViewMode[] = ['owner', 'customer']
const OWNER_LAYOUTS: readonly OwnerLayout[] = ['table', 'gallery']
const TYPE_FILTERS: readonly TypeFilterValue[] = ['all', 'SALE', 'PF', 'MOD']

function pickParam<T extends string>(
  params: URLSearchParams,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const v = params.get(key)
  return (allowed as readonly string[]).includes(v ?? '') ? (v as T) : fallback
}

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
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()

  // Derived state from URL query — shareable, refresh-safe.
  const view = pickParam<ViewMode>(searchParams, 'view', VIEW_MODES, 'owner')
  const ownerLayout = pickParam<OwnerLayout>(searchParams, 'layout', OWNER_LAYOUTS, 'table')
  const typeFilter = pickParam<TypeFilterValue>(searchParams, 'type', TYPE_FILTERS, 'SALE')
  const selectedCategory = searchParams.get('cat')

  // URL-driven drawer: /menu/dish/:productCode opens DetailDrawer on that dish.
  const drawerProductCode = useMemo(() => {
    const m = location.pathname.match(/^\/menu\/dish\/([^/]+)/)
    return m ? decodeURIComponent(m[1]) : null
  }, [location.pathname])
  const drawerItem = useMemo(
    () => (drawerProductCode ? items.find((i) => i.product_code === drawerProductCode) ?? null : null),
    [items, drawerProductCode],
  )

  // Setter that merges into existing query (omitting defaults for cleaner URLs).
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

  const setView = useCallback(
    (v: ViewMode) => updateParam({ view: v === 'owner' ? null : v }),
    [updateParam],
  )
  const setOwnerLayout = useCallback(
    (l: OwnerLayout) => updateParam({ layout: l === 'table' ? null : l }),
    [updateParam],
  )
  const setTypeFilter = useCallback(
    (t: TypeFilterValue) => updateParam({ type: t === 'SALE' ? null : t }),
    [updateParam],
  )
  const setSelectedCategory = useCallback(
    (cat: string | null) => updateParam({ cat }),
    [updateParam],
  )

  const openDrawer = useCallback(
    (id: string) => {
      const item = items.find((i) => i.id === id)
      if (!item) return
      navigate({
        pathname: `/menu/dish/${encodeURIComponent(item.product_code)}`,
        search: location.search,
      })
    },
    [items, navigate, location.search],
  )
  const closeDrawer = useCallback(
    () => navigate({ pathname: '/menu', search: location.search }),
    [navigate, location.search],
  )

  const [chefOpen, setChefOpen] = useState(false)
  const [newDishOpen, setNewDishOpen] = useState(false)
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
        <div>
          <h1 className="text-lg font-bold text-slate-100">Menu</h1>
          <p className="text-xs text-slate-500">
            {totalDishes} dishes &middot; {availableCount} available &middot; {featuredCount} featured &middot; avg food cost {avgFoodCost.toFixed(1)}%
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* New Dish button */}
          <button
            onClick={() => setNewDishOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-700"
            title="Create new dish"
          >
            <Plus className="h-3.5 w-3.5" />
            New dish
          </button>

          {/* AI Chef button */}
          <button
            onClick={() => setChefOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-emerald-700/50 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 transition hover:border-emerald-600 hover:bg-emerald-500/20"
            title="Open AI Chef"
          >
            <Sparkles className="h-3.5 w-3.5" />
            AI Chef
          </button>

          {/* Owner layout toggle */}
          {view === 'owner' && (
            <div className="flex rounded-lg border border-slate-700 bg-slate-900 p-0.5">
              <button
                onClick={() => setOwnerLayout('table')}
                className={`flex items-center rounded-md p-1.5 transition ${
                  ownerLayout === 'table'
                    ? 'bg-slate-700 text-slate-100'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                title="Table view"
              >
                <Table2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setOwnerLayout('gallery')}
                className={`flex items-center rounded-md p-1.5 transition ${
                  ownerLayout === 'gallery'
                    ? 'bg-slate-700 text-slate-100'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                title="Gallery view"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* View toggle */}
          <div className="flex rounded-lg border border-slate-700 bg-slate-900 p-0.5">
            <button
              onClick={() => setView('owner')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                view === 'owner'
                  ? 'bg-slate-700 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Owner
            </button>
            <button
              onClick={() => setView('customer')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                view === 'customer'
                  ? 'bg-slate-700 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
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
        <div className="flex items-center justify-center py-32 text-xs text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-emerald-500" />
          Loading menu...
        </div>
      ) : error ? (
        <div className="rounded-lg border border-rose-800/50 bg-rose-950/30 p-4 text-sm text-rose-300">
          Failed to load menu: {error}
        </div>
      ) : dishes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-slate-500">
          <ChefHat className="mb-3 h-10 w-10 text-slate-600" />
          <p className="text-sm font-medium text-slate-400">No dishes yet</p>
          <p className="mt-1 text-xs text-slate-600">
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
          onOpenDrawer={openDrawer}
          autoExpandId={justCreatedId}
        />
      ) : view === 'owner' && ownerLayout === 'gallery' ? (
        <OwnerGallery
          dishes={dishes}
          selectedCategory={selectedCategory}
          onUpdate={updateItem}
          onOpenDrawer={openDrawer}
        />
      ) : (
        <CustomerPreview
          dishes={dishes}
          categories={categories}
          selectedCategory={selectedCategory}
          onOpenDish={openDrawer}
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
        item={drawerItem}
        onClose={closeDrawer}
        onToggleAvailable={async (id, next) => {
          await inlineUpdate.commit(id, { is_available: next })
        }}
        returnFocusToId={drawerItem?.id ?? null}
      />
    </div>
  )
}
