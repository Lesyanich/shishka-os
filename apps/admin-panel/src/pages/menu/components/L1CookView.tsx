import { Fragment, useMemo, useState } from 'react'
import {
  Package,
  Clock,
  Snowflake,
  AlertTriangle,
  ChefHat,
  ChevronDown,
  ChevronRight,
  Utensils,
} from 'lucide-react'
import type { MenuItem, MenuBomChild } from '../../../hooks/useMenuData'
import type { PfPackCardData } from '../../../hooks/usePfPackCard'
import type { RecipeStepStats } from '../../../hooks/useMenuListEnrichment'
import type { DishCardData } from '../../../hooks/useDishCard'
import type { TypeFilterValue } from '../../../components/menu/owner/TypeFilter'

interface L1CookViewProps {
  items: MenuItem[]
  selectedCategory: string | null
  typeFilter: TypeFilterValue
  /** null = show all, true = available only, false = unavailable only */
  availableFilter: boolean | null
  pfPackCardById: Map<string, PfPackCardData>
  recipeStatsById: Map<string, RecipeStepStats>
  dishCardById: Map<string, DishCardData>
  childrenByParent: Map<string, MenuBomChild[]>
  onOpenDish: (id: string) => void
}

/* ── PF card (existing, unchanged) ─────────────────────────── */

interface PfCardProps {
  item: MenuItem
  card: PfPackCardData | undefined
  stats: RecipeStepStats | undefined
  onOpen: () => void
}

function PfCard({ item, card, stats, onOpen }: PfCardProps) {
  const portionInfo =
    card?.portions_per_batch != null && card?.portion_weight_g != null
      ? `${card.portions_per_batch} × ${card.portion_weight_g} g`
      : null
  const packInfo = card?.vacuum_bag_size
    ? `bag ${card.vacuum_bag_size}${card.portions_per_bag != null ? ` (${card.portions_per_bag}/bag)` : ''}`
    : null
  const tempRange =
    card?.storage_temp_min_c != null && card?.storage_temp_max_c != null
      ? `${card.storage_temp_min_c}–${card.storage_temp_max_c}°C`
      : null
  const stepCount = stats?.step_count ?? 0
  const ccpCount = stats?.ccp_count ?? 0
  const hasPhoto = !!card?.kitchen_photo_url

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col gap-3 rounded-xl border border-surface-3 bg-surface-2 p-4 text-left transition hover:border-amber-watch/40 hover:bg-surface-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-amber-watch)]/60"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[var(--color-amber-watch)]/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[color:var(--color-amber-watch)]">
              PF
            </span>
            <h3 className="truncate text-sm font-medium text-cream">
              {item.name}
            </h3>
          </div>
          <p className="mt-0.5 font-mono text-[10px] text-cream/40">
            {item.product_code}
          </p>
        </div>
        {hasPhoto && (
          <img
            src={card!.kitchen_photo_url!}
            alt={`${item.name} kitchen reference`}
            className="h-12 w-12 shrink-0 rounded-md object-cover"
            loading="lazy"
          />
        )}
      </div>

      {item.kitchen_note ? (
        <p className="line-clamp-2 text-xs text-cream/65">{item.kitchen_note}</p>
      ) : (
        <p className="text-xs italic text-cream/35">No kitchen note</p>
      )}

      <dl className="grid grid-cols-2 gap-2 text-[11px]">
        {portionInfo && (
          <div className="flex items-center gap-1.5 text-cream/65">
            <Package className="h-3 w-3 text-cream/40" />
            <span>{portionInfo}</span>
          </div>
        )}
        {packInfo && (
          <div className="flex items-center gap-1.5 text-cream/65">
            <Package className="h-3 w-3 text-cream/40" />
            <span className="truncate">{packInfo}</span>
          </div>
        )}
        {card?.shelf_life_days != null && (
          <div className="flex items-center gap-1.5 text-cream/65">
            <Clock className="h-3 w-3 text-cream/40" />
            <span>{card.shelf_life_days} d shelf</span>
          </div>
        )}
        {tempRange && (
          <div className="flex items-center gap-1.5 text-cream/65">
            <Snowflake className="h-3 w-3 text-cream/40" />
            <span>{tempRange}</span>
          </div>
        )}
        {card?.storage_zone && (
          <div className="col-span-2 flex items-center gap-1.5 text-cream/65">
            <Snowflake className="h-3 w-3 text-cream/40" />
            <span className="truncate">{card.storage_zone}</span>
          </div>
        )}
      </dl>

      <div className="flex items-center gap-2 border-t border-surface-3 pt-2 text-[11px]">
        <span className="flex items-center gap-1 text-cream/55">
          <ChefHat className="h-3 w-3" />
          {stepCount} {stepCount === 1 ? 'step' : 'steps'}
        </span>
        {ccpCount > 0 && (
          <span className="flex items-center gap-1 text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            {ccpCount} CCP
          </span>
        )}
        {stepCount === 0 && (
          <span className="italic text-cream/35">No recipe defined</span>
        )}
      </div>
    </button>
  )
}

/* ── SALE recipe card with BOM tree ────────────────────────── */

interface SaleRecipeCardProps {
  item: MenuItem
  card: DishCardData | undefined
  stats: RecipeStepStats | undefined
  bomChildren: MenuBomChild[]
  onOpen: () => void
}

function SaleRecipeCard({ item, stats, bomChildren, onOpen }: SaleRecipeCardProps) {
  const [expanded, setExpanded] = useState(false)
  const stepCount = stats?.step_count ?? 0
  const ccpCount = stats?.ccp_count ?? 0
  const hasPhoto = !!item.image_url

  const costDisplay =
    item.cost_per_unit != null ? `฿${item.cost_per_unit.toFixed(0)}` : null
  const priceDisplay = item.price != null ? `฿${item.price}` : null
  const foodCostPct =
    item.price && item.cost_per_unit
      ? ((item.cost_per_unit / item.price) * 100).toFixed(0)
      : null

  return (
    <div className="flex flex-col rounded-xl border border-surface-3 bg-surface-2 text-left transition hover:border-forest-soft/40 hover:bg-surface-3">
      <button
        type="button"
        onClick={onOpen}
        className="flex flex-col gap-3 p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-forest-soft)]/60"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[var(--color-royal-green)]/25 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[color:var(--color-forest-soft)]">
                SALE
              </span>
              <h3 className="truncate text-sm font-medium text-cream">
                {item.name}
              </h3>
            </div>
            <p className="mt-0.5 font-mono text-[10px] text-cream/40">
              {item.product_code}
            </p>
          </div>
          {hasPhoto && (
            <img
              src={item.image_url!}
              alt={item.name}
              className="h-12 w-12 shrink-0 rounded-md object-cover"
              loading="lazy"
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {priceDisplay && (
            <span className="text-cream/70">{priceDisplay}</span>
          )}
          {costDisplay && (
            <span className="text-cream/50">cost {costDisplay}</span>
          )}
          {foodCostPct && (
            <span
              className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                Number(foodCostPct) < 30
                  ? 'bg-emerald-900/40 text-emerald-300'
                  : Number(foodCostPct) <= 45
                    ? 'bg-amber-900/40 text-amber-300'
                    : 'bg-red-900/40 text-red-300'
              }`}
            >
              FC {foodCostPct}%
            </span>
          )}
          <span className="flex items-center gap-1 text-cream/55">
            <ChefHat className="h-3 w-3" />
            {stepCount} {stepCount === 1 ? 'step' : 'steps'}
          </span>
          {ccpCount > 0 && (
            <span className="flex items-center gap-1 text-amber-400">
              <AlertTriangle className="h-3 w-3" />
              {ccpCount} CCP
            </span>
          )}
        </div>
      </button>

      {/* BOM tree toggle */}
      {bomChildren.length > 0 && (
        <div className="border-t border-surface-3">
          <button
            type="button"
            onClick={() => setExpanded((p) => !p)}
            className="flex w-full items-center gap-1.5 px-4 py-2 text-[11px] text-cream/55 transition hover:text-cream/80"
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <Utensils className="h-3 w-3" />
            {bomChildren.length} ingredient{bomChildren.length !== 1 ? 's' : ''}
          </button>
          {expanded && (
            <ul className="space-y-1 px-4 pb-3">
              {bomChildren.map((bom) => {
                const child = bom.child
                const kindBadge = child?.kind ?? 'RAW'
                const badgeColor =
                  kindBadge === 'PF'
                    ? 'bg-[var(--color-amber-watch)]/20 text-[color:var(--color-amber-watch)]'
                    : kindBadge === 'MOD'
                      ? 'bg-violet-900/40 text-violet-300'
                      : 'bg-slate-700 text-slate-300'
                return (
                  <li
                    key={bom.id}
                    className="flex items-center gap-2 text-[11px]"
                  >
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider ${badgeColor}`}
                    >
                      {kindBadge}
                    </span>
                    <span className="min-w-0 truncate text-cream/70">
                      {child?.name ?? bom.childId}
                    </span>
                    <span className="ml-auto shrink-0 font-mono text-[10px] text-cream/40">
                      ×{bom.quantityPerUnit}
                      {bom.yieldLossPct ? ` (−${bom.yieldLossPct}%)` : ''}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Category section header ───────────────────────────────── */

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="col-span-full flex items-center gap-2 pt-2 first:pt-0">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-cream/50">
        {title}
      </h2>
      <span className="font-mono text-[10px] tabular-nums text-cream/30">
        {count}
      </span>
      <div className="h-px flex-1 bg-surface-3" />
    </div>
  )
}

/* ── Main view ─────────────────────────────────────────────── */

export function L1CookView({
  items,
  selectedCategory,
  typeFilter,
  availableFilter,
  pfPackCardById,
  recipeStatsById,
  dishCardById,
  childrenByParent,
  onOpenDish,
}: L1CookViewProps) {
  // Filter: SALE + PF (exclude MOD), respect category, type, and availability
  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (i.kind === 'MOD') return false
      if (typeFilter === 'SALE' && i.kind !== 'SALE') return false
      if (typeFilter === 'PF' && i.kind !== 'PF' && !i.isDualType) return false
      if (selectedCategory && i.category_id !== selectedCategory) return false
      if (availableFilter !== null && i.is_available !== availableFilter) return false
      return true
    })
  }, [items, selectedCategory, typeFilter, availableFilter])

  // Group by category for structured rendering
  const grouped = useMemo(() => {
    const catOrder = new Map<string, { name: string; items: MenuItem[] }>()
    const uncategorized: MenuItem[] = []

    for (const item of filtered) {
      if (!item.category_id || !item.category_name) {
        uncategorized.push(item)
        continue
      }
      const existing = catOrder.get(item.category_id)
      if (existing) {
        existing.items.push(item)
      } else {
        catOrder.set(item.category_id, {
          name: item.category_name,
          items: [item],
        })
      }
    }

    return { categories: Array.from(catOrder.values()), uncategorized }
  }, [filtered])

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-20 text-cream/50">
        <ChefHat className="h-10 w-10 text-cream/30" />
        <p className="text-sm">No items in this category.</p>
      </div>
    )
  }

  const renderItem = (item: MenuItem) => {
    if (item.kind === 'SALE') {
      return (
        <SaleRecipeCard
          key={item.id}
          item={item}
          card={dishCardById.get(item.id)}
          stats={recipeStatsById.get(item.id)}
          bomChildren={childrenByParent.get(item.id) ?? []}
          onOpen={() => onOpenDish(item.id)}
        />
      )
    }
    return (
      <PfCard
        key={item.id}
        item={item}
        card={pfPackCardById.get(item.id)}
        stats={recipeStatsById.get(item.id)}
        onOpen={() => onOpenDish(item.id)}
      />
    )
  }

  // If only one type is selected, skip category grouping if only one category
  const showGroupHeaders =
    grouped.categories.length > 1 || grouped.uncategorized.length > 0

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {grouped.categories.map((group) => (
        <Fragment key={group.name}>
          {showGroupHeaders && (
            <SectionHeader title={group.name} count={group.items.length} />
          )}
          {group.items.map(renderItem)}
        </Fragment>
      ))}
      {grouped.uncategorized.length > 0 && (
        <>
          {showGroupHeaders && (
            <SectionHeader
              title="Uncategorized"
              count={grouped.uncategorized.length}
            />
          )}
          {grouped.uncategorized.map(renderItem)}
        </>
      )}
    </div>
  )
}
