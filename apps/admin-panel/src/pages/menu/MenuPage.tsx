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
  Search,
  X,
} from 'lucide-react'
import { useMenuData } from '../../hooks/useMenuData'
import { useInlineUpdate } from '../../hooks/useInlineUpdate'
import { useMenuListEnrichment } from '../../hooks/useMenuListEnrichment'
import { useChannelMargins } from '../../hooks/useChannelMargins'
import { OwnerTable } from './components/OwnerTable'
import { OwnerGallery } from './components/OwnerGallery'
import { CustomerPreview } from './components/CustomerPreview'
import { StationRecipesView } from './components/StationRecipesView'
import { NewDishModal } from './components/NewDishModal'
import { ChefChatPanel } from '../../components/chef/ChefChatPanel'
import { TypeFilter, matchesType, type TypeFilterValue } from '../../components/menu/owner/TypeFilter'
import { FilterBar } from '../../components/menu/owner/FilterBar'
import { DishDrawer } from '../../components/menu/drawer/DishDrawer'
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
    categoriesById,
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
  // L1 Cook is the kitchen prep station — default its type filter to PF so cooks
  // land on semi-finished prep items, not customer SALE dishes. Other views keep
  // SALE as the default. The switcher stays in every view, so a cook can still
  // flip to SALE/All on demand.
  const defaultType: TypeFilterValue = view === 'l1-cook' ? 'PF' : 'SALE'
  const typeFilter = pickParam<TypeFilterValue>(searchParams, 'type', TYPE_FILTERS, defaultType)

  // Owner view: full multi-filter state (categories, available, loyverse, flags)
  const { filters, setFilters } = useMenuFilters()
  // Back-compat for L1/L2/Customer single-cat strip — derive single string|null
  const selectedCategory = filters.categoryIds[0] ?? null
  const setSelectedCategory = useCallback(
    (id: string | null) => {
      // Single setSearchParams call — two calls in one handler only apply the
      // last one in React Router v7 navigation, so cat update would be lost.
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
    (t: TypeFilterValue) => updateParam({ type: t === defaultType ? null : t }),
    [updateParam, defaultType],
  )

  // L1/L2 station name search (?q=) — shareable/refresh-safe like the other filters.
  // Uses history replace (not push) so every keystroke doesn't spam the back button.
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
  // Applied uniformly across every view via the shared `matchesType` predicate
  // so the type filter behaves identically in Owner, L1 Cook, and L2 Assembler.
  // L1 Cook = the kitchen PREP station (заготовки) and defaults to PF; L2 =
  // the store ASSEMBLY station and defaults to SALE. The cook can still flip
  // the filter, but the two stations stay conceptually distinct.
  const typeFilteredItems = useMemo(
    () => items.filter((i) => matchesType(i, typeFilter)),
    [items, typeFilter],
  )

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
    const filtered = applyFilters(
      typeFilteredItems.map((i) => ({ ...i, hasBom: hasBomById.get(i.id) ?? false })),
      filters,
    )
    const q = searchQuery.trim().toLowerCase()
    return q ? filtered.filter((i) => i.name.toLowerCase().includes(q)) : filtered
  }, [typeFilteredItems, filters, view, hasBomById, searchQuery])

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
    <div className="menu-canvas -mx-4 space-y-5 px-4 pt-5 pb-10 sm:-mx-6 sm:px-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <span className="shk-seal" aria-hidden>S</span>
          <div>
            <div className="shk-eyebrow">Menu control &middot; preview</div>
            <h1 className="mt-1 font-display text-4xl font-bold leading-none tracking-tight text-cream">
              Menu
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* New Dish — spice-red CTA */}
          <button
            onClick={() => setNewDishOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-royal-red)] px-4 py-2 text-xs font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] transition hover:brightness-110"
            title="Create new dish"
          >
            <Plus className="h-3.5 w-3.5" />
            New dish
          </button>

          {/* AI Chef — royal-green ghost */}
          <button
            onClick={() => setChefOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-forest-soft/40 bg-royal-green/30 px-4 py-2 text-xs font-semibold text-forest-soft transition hover:border-forest-soft hover:bg-royal-green/40"
            title="Open AI Chef"
          >
            <Sparkles className="h-3.5 w-3.5" />
            AI Chef
          </button>

          {/* Owner layout toggle (table / gallery) */}
          {view === 'owner' && (
            <div className="shk-seg" role="group" aria-label="Owner layout">
              <button
                onClick={() => setOwnerLayout('table')}
                className="shk-seg-btn px-2"
                aria-pressed={ownerLayout === 'table'}
                aria-label="Table view"
                title="Table view"
              >
                <Table2 className="shk-seg-ico h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setOwnerLayout('gallery')}
                className="shk-seg-btn px-2"
                aria-pressed={ownerLayout === 'gallery'}
                aria-label="Gallery view"
                title="Gallery view"
              >
                <LayoutGrid className="shk-seg-ico h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* View switch (4 roles) */}
          <div className="shk-seg" role="group" aria-label="View mode">
            {VIEW_MODES.map((v) => {
              const { label, icon: Icon } = VIEW_LABELS[v]
              const active = view === v
              return (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className="shk-seg-btn"
                  title={`${label} view`}
                  aria-pressed={active}
                >
                  <Icon className="shk-seg-ico h-3.5 w-3.5" />
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* KPI cards — counts for the active view */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="shk-kpi">
          <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-cream/60">Dishes</div>
          <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-cream">{totalDishes}</div>
          <div className="mt-0.5 text-[11px] text-cream/40">in this view</div>
        </div>
        <div className="shk-kpi">
          <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-cream/60">Available</div>
          <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-cream">{availableCount}</div>
          <div className="mt-0.5 text-[11px] text-cream/40">
            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-forest-soft align-middle" />
            {totalDishes > 0 ? Math.round((availableCount / totalDishes) * 100) : 0}% orderable
          </div>
        </div>
        <div className="shk-kpi">
          <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-cream/60">Featured</div>
          <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-honey-300">{featuredCount}</div>
          <div className="mt-0.5 text-[11px] text-cream/40">on the hero rail</div>
        </div>
        <div className="shk-kpi">
          <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-cream/60">Avg food cost</div>
          <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-honey-300">{avgFoodCost.toFixed(1)}%</div>
          <div className="mt-0.5 text-[11px] text-cream/40">target &lt; 35%</div>
        </div>
      </div>

      {/* Owner: TypeFilter + FilterBar (replaces old TypeFilter + CategoryTabs) */}
      {view === 'owner' && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <TypeFilter value={typeFilter} onChange={setTypeFilter} counts={typeCounts} />
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-cream/40" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name…"
                className="w-56 rounded-lg border border-surface-3 bg-surface-1 py-1.5 pl-8 pr-7 text-xs text-cream placeholder:text-cream/35 focus:outline-none focus:ring-1 focus:ring-forest-soft"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-cream/40 hover:text-cream/70"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <FilterBar
            filters={filters}
            categories={categories}
            categoryCounts={categoryCounts}
            onChange={setFilters}
          />
        </div>
      )}
      {/* L1/L2 station controls (type filter, availability, data-driven chips)
          render inside RecipeStationPanel below, alongside the cards. */}

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
      ) : view === 'l1-cook' || view === 'l2-assembler' ? (
        <StationRecipesView
          station={view}
          mode="owner"
          items={items}
          categoriesById={categoriesById}
          subcategories={subcategories}
          childrenByParent={childrenByParent}
          enrichment={enrichment}
          typeCounts={typeCounts}
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
        onToggleWeb={(id, next) => {
          void updateItem(id, { is_web_visible: next })
        }}
        returnFocusToId={drawerItem?.id ?? null}
        modifierOptions={
          drawerItem ? (enrichment.modifierOptionsByDish.get(drawerItem.id) ?? []) : []
        }
      />
    </div>
  )
}
