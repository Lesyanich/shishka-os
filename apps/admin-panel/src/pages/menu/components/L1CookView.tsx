import { useMemo } from 'react'
import { Package, Clock, Snowflake, AlertTriangle, ChefHat } from 'lucide-react'
import type { MenuItem } from '../../../hooks/useMenuData'
import type { PfPackCardData } from '../../../hooks/usePfPackCard'
import type { RecipeStepStats } from '../../../hooks/useMenuListEnrichment'

interface L1CookViewProps {
  items: MenuItem[]
  selectedCategory: string | null
  pfPackCardById: Map<string, PfPackCardData>
  recipeStatsById: Map<string, RecipeStepStats>
  onOpenDish: (id: string) => void
}

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

export function L1CookView({
  items,
  selectedCategory,
  pfPackCardById,
  recipeStatsById,
  onOpenDish,
}: L1CookViewProps) {
  const pfItems = useMemo(
    () =>
      items.filter(
        (i) =>
          i.kind === 'PF' &&
          (!selectedCategory || i.category_id === selectedCategory),
      ),
    [items, selectedCategory],
  )

  if (pfItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-20 text-cream/50">
        <ChefHat className="h-10 w-10 text-cream/30" />
        <p className="text-sm">No PF items in this category.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {pfItems.map((item) => (
        <PfCard
          key={item.id}
          item={item}
          card={pfPackCardById.get(item.id)}
          stats={recipeStatsById.get(item.id)}
          onOpen={() => onOpenDish(item.id)}
        />
      ))}
    </div>
  )
}
