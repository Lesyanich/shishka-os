import { useCallback, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Eye,
  Table2,
  LayoutGrid,
  Loader2,
  ChefHat,
  Sparkles,
  Plus,
  Package,
  Shield,
} from 'lucide-react'
import { useMenuData } from '../../hooks/useMenuData'
import { useInlineUpdate } from '../../hooks/useInlineUpdate'
import { useMenuListEnrichment } from '../../hooks/useMenuListEnrichment'
import { useChannelMargins } from '../../hooks/useChannelMargins'
import { OwnerTable } from './components/OwnerTable'
import { OwnerGallery } from './components/OwnerGallery'
import { CustomerPreview } from './components/CustomerPreview'
import { L1CookView } from './components/L1CookView'
import { L2AssemblerView } from './components/L2AssemblerView'
import { NewDishModal } from './components/NewDishModal'
import { ChefChatPanel } from '../../components/chef/ChefChatPanel'
import { TypeFilter, type TypeFilterValue } from '../../components/menu/owner/TypeFilter'
import { FilterBar } from '../../components/menu/owner/FilterBar'
import { DishDrawer } from '../../components/menu/drawer/DishDrawer'
import { CategoryTabs } from '../../components/menu/shared'
import { useMenuFilters, applyFilters } from './hooks/useMenuFilters'

type ViewMode = 'owner' | 'l1-cook' | 'l2-assembler' | 'customer'
type OwnerLayout = 'table' | 'gallery'

const VIEW_MODES: readonly ViewMode[] = ['owner', 'l1-cook', 'l2-assembler', 'customer']
const OWNER_LAYOUTS: readonly OwnerLayout[] = ['table', 'gallery']
const TYPE_FILTERS: readonly TypeFilterValue[] = ['all', 'SALE', 'PF', 'MOD']

const VIEW_LABELS: Record<ViewMode, { label: string; icon: typeof Shield }> = {
  owner: { label: 'Owner', icon: Shield },
  'l1-cook': { label: 'L1 Cook', icon: ChefHat },
  'l2-assembler': { label: 'L2 Assembler', icon: Package },
  customer: { label: 'Customer', icon: Eye },
}

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
    reorderItems,
    refetch,
  } = useMenuData()
  const inlineUpdate = useInlineUpdate(updateItem)
  const enrichment = useMenuListEnrichment(items, childrenByParent)
  const { margins: grabMargins } = useChannelMargins('grab')
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()

  // Derived state from URL query — shareable, refresh-safe.
  const view = pickParam<ViewMode>(searchParams, 'view', VIEW_MODES, 'owner')
  const ownerLayout = pickParam<OwnerLayout>(searchParams, 'layout', OWNER_LAYOUTS, 'table')
  const typeFilter = pickParam<TypeFilterValue>(searchParams, 'type', TYPE_FILTERS, 'SALE')

  // Owner view: full multi-filter state (categories, available, loyverse, flags)
  const { filters, setFilters } = useMenuFilters()
  // Back-compat for L1/L2/Customer single-cat strip — derive single string|null
  const selectedCategory = filters.categoryIds[0] ?? null
  const setSelectedCategory = useCallback(
    (id: string | null) =>
      setFilters({ categoryIds: id ? [id] : [], available: null, loyverse: null, flags: [] }),
    [setFilters],
  )

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

  // Availability filter for L1 Cook view (URL-driven: ?available=yes|no)
  const availableParam = searchParams.get('available')
  const availableFilter: boolean | null =
    availableParam === 'yes' ? true : availableParam === 'no' ? false : null
  const setAvailableFilter = useCallback(
    (v: boolean | null) =>
      updateParam({ available: v === true ? 'yes' : v === false ? 'no' : null }),
    [updateParam],
  )

  // L2 Assembler availability filter (kitchen station): defaults to Active-only.
  // Shares the `available` param but treats an absent value as "Active" rather
  // than "All", so deactivated dishes are hidden unless explicitly requested.
  const l2AvailableFilter: boolean | null =
    availableParam === 'all' ? null : availableParam === 'no' ? false : availableParam === 'yes' ? true : true
  const setL2AvailableFilter = useCallback(
    (v: boolean | null) =>
      updateParam({ available: v === true ? 'yes' : v === false ? 'no' : 'all' }),
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

  // Pre-compute hasBom per item id (for `no-bom` flag filter)
  const hasBomById = useMemo(() => {
    const m = new Map<string, boolean>()
    for (const item of items) {
      m.set(item.id, (childrenByParent.get(item.id)?.length ?? 0) > 0)
    }
    return m
  }, [items, childrenByParent])

  // Apply user filters ONLY in Owner view; L1/L2/Customer keep their cat-strip
  const ownerFilteredItems = useMemo(() => {
    if (view !== 'owner') return typeFilteredItems
    return applyFilters(
      typeFilteredItems.map((i) => ({ ...i, hasBom: hasBomById.get(i.id) ?? false })),
      filters,
    )
  }, [typeFilteredItems, filters, view, hasBomById])

  // Filtered dishes (SALE only) for OwnerGallery
  const ownerFilteredDishes = useMemo(
    () => ownerFilteredItems.filter((i) => i.kind === 'SALE'),
    [ownerFilteredItems],
  )

  // Counts per SECTION (null key = "All") within the active type filter.
  // Keyed by section_id so the tab strip / filter chips (which list sections)
  // show the rolled-up umbrella counts, not per-leaf-subcategory counts.
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

  // Stats — Owner view uses fully-filtered set (FilterBar applied); other views use type-filtered set
  const statsSource = view === 'owner' ? ownerFilteredItems : typeFilteredItems
  const totalDishes = statsSource.length
  const availableCount = statsSource.filter((d) => d.is_available).length
  const featuredCount = statsSource.filter((d) => d.is_featured).length
  // Food-cost % uses FOOD-only cost (packaging excluded) per owner decision.
  const fcDenom = statsSource.filter((d) => d.price && (d.food_cost ?? d.cost_per_unit)).length || 1
  const avgFoodCost =
    statsSource.reduce((sum, d) => {
      const foodCost = d.food_cost ?? d.cost_per_unit
      if (!d.price || !foodCost) return sum
      return sum + (foodCost / d.price) * 100
    }, 0) / fcDenom

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-cream">Menu</h1>
          <p className="text-xs text-cream/50">
            {totalDishes} dishes &middot; {availableCount} available &middot; {featuredCount} featured &middot; avg food cost {avgFoodCost.toFixed(1)}%
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* New Dish button */}
          <button
            onClick={() => setNewDishOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-surface-3 bg-surface-2 px-3 py-1.5 text-xs font-medium text-cream transition hover:border-surface-3 hover:bg-surface-3"
            title="Create new dish"
          >
            <Plus className="h-3.5 w-3.5" />
            New dish
          </button>

          {/* AI Chef button */}
          <button
            onClick={() => setChefOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-forest-soft/40 bg-royal-green/25 px-3 py-1.5 text-xs font-medium text-forest-soft transition hover:border-forest-soft hover:bg-royal-green/30"
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
                    : 'text-cream/50 hover:text-cream/80'
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
                    : 'text-cream/50 hover:text-cream/80'
                }`}
                title="Gallery view"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* View toggle (4 roles) */}
          <div className="flex rounded-lg border border-surface-3 bg-surface-1 p-0.5">
            {VIEW_MODES.map((v) => {
              const { label, icon: Icon } = VIEW_LABELS[v]
              const active = view === v
              return (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                    active
                      ? 'bg-surface-3 text-cream'
                      : 'text-cream/60 hover:text-cream'
                  }`}
                  title={`${label} view`}
                  aria-pressed={active}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Owner: TypeFilter + FilterBar (replaces old TypeFilter + CategoryTabs) */}
      {view === 'owner' && (
        <div className="space-y-2">
          <TypeFilter value={typeFilter} onChange={setTypeFilter} counts={typeCounts} />
          <FilterBar
            filters={filters}
            categories={categories}
            categoryCounts={categoryCounts}
            onChange={setFilters}
          />
        </div>
      )}
      {/* L1 Cook: TypeFilter + AvailabilityFilter + CategoryTabs with counts */}
      {view === 'l1-cook' && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <TypeFilter value={typeFilter} onChange={setTypeFilter} counts={typeCounts} />
            <div className="flex rounded-lg border border-surface-3 bg-surface-1 p-0.5">
              {([
                { value: null, label: 'All' },
                { value: true, label: 'Active' },
                { value: false, label: 'Inactive' },
              ] as const).map(({ value, label }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setAvailableFilter(value)}
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
          {categories.length > 0 && (
            <CategoryTabs
              categories={categories}
              selectedId={selectedCategory}
              onSelect={setSelectedCategory}
              counts={categoryCounts}
            />
          )}
        </div>
      )}
      {/* L2: availability toggle (default Active-only) + single-category strip */}
      {view === 'l2-assembler' && (
        <div className="space-y-2">
          <div className="flex w-fit rounded-lg border border-surface-3 bg-surface-1 p-0.5">
            {([
              { value: true, label: 'Active' },
              { value: false, label: 'Inactive' },
              { value: null, label: 'All' },
            ] as const).map(({ value, label }) => (
              <button
                key={label}
                type="button"
                onClick={() => setL2AvailableFilter(value)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  l2AvailableFilter === value
                    ? 'bg-surface-3 text-cream'
                    : 'text-cream/50 hover:text-cream/80'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {categories.length > 0 && (
            <CategoryTabs
              categories={categories}
              selectedId={selectedCategory}
              onSelect={setSelectedCategory}
            />
          )}
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-32 text-xs text-cream/50">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-forest-soft" />
          Loading menu...
        </div>
      ) : error ? (
        <div className="rounded-lg border border-brick-soft/40 bg-brick-soft/15 p-4 text-sm text-brick-soft">
          Failed to load menu: {error}
        </div>
      ) : dishes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-cream/50">
          <ChefHat className="mb-3 h-10 w-10 text-cream/40" />
          <p className="text-sm font-medium text-cream/60">No dishes yet</p>
          <p className="mt-1 text-xs text-cream/40">
            Add SALE-type dishes in the nomenclature to see them here.
          </p>
        </div>
      ) : view === 'owner' && ownerLayout === 'table' ? (
        <OwnerTable
          items={ownerFilteredItems}
          typeFilter={typeFilter}
          selectedCategory={null}
          subcategories={subcategories}
          childrenByParent={childrenByParent}
          dualTypeIds={dualTypeIds}
          onUpdate={inlineUpdate.commit}
          isFailed={inlineUpdate.isFailed}
          errorFor={inlineUpdate.errorFor}
          onOpenDrawer={openDrawer}
          autoExpandId={justCreatedId}
          grabMargins={grabMargins}
          onPushed={() => refetch()}
        />
      ) : view === 'owner' && ownerLayout === 'gallery' ? (
        <OwnerGallery
          dishes={ownerFilteredDishes}
          selectedCategory={null}
          onUpdate={updateItem}
          onOpenDrawer={openDrawer}
        />
      ) : view === 'l1-cook' ? (
        <L1CookView
          items={items}
          selectedCategory={selectedCategory}
          typeFilter={typeFilter}
          availableFilter={availableFilter}
          pfPackCardById={enrichment.pfPackCardById}
          recipeStatsById={enrichment.recipeStatsById}
          dishCardById={enrichment.dishCardById}
          childrenByParent={childrenByParent}
          onOpenDish={openDrawer}
        />
      ) : view === 'l2-assembler' ? (
        <L2AssemblerView
          items={items}
          selectedCategory={selectedCategory}
          availableFilter={l2AvailableFilter}
          dishCardById={enrichment.dishCardById}
          componentsByDish={enrichment.componentsByDish}
          recipeStepsByDish={enrichment.recipeStepsByDish}
          modifierOptionsByDish={enrichment.modifierOptionsByDish}
          packagingByDish={enrichment.packagingByDish}
          onOpenDish={openDrawer}
          onReorder={reorderItems}
        />
      ) : (
        <CustomerPreview
          dishes={dishes}
          categories={categories}
          selectedCategory={selectedCategory}
          allergensByDishId={enrichment.allergensByDishId}
          dishCardById={enrichment.dishCardById}
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

      {/* Menu card drawer — slide-in right panel with role tabs */}
      <DishDrawer
        item={drawerItem}
        onClose={closeDrawer}
        onSaved={() => refetch()}
        returnFocusToId={drawerItem?.id ?? null}
        modifierOptions={
          drawerItem ? (enrichment.modifierOptionsByDish.get(drawerItem.id) ?? []) : []
        }
      />
    </div>
  )
}
