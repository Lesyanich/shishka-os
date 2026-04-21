import { Star } from 'lucide-react'
import type { DishSummary, PortionUnit } from './types'
import { NutritionBadges } from './NutritionBadges'
import { CBSTags } from './CBSTags'
import { PriceLabel } from './PriceLabel'
import { DishPhotoSlot } from './DishPhotoSlot'

interface DishCardProps {
  dish: DishSummary
  onClick?: (id: string) => void
}

function formatPortion(size: number | null, unit: PortionUnit | null): string | null {
  if (size == null || unit == null) return null
  if (unit === 'pcs') return size === 1 ? '1 pc' : `${size} pcs`
  return `${size}${unit}`
}

export function DishCard({ dish, onClick }: DishCardProps) {
  const portion = formatPortion(dish.portionSize, dish.portionUnit)
  const interactive = onClick != null

  const Wrapper: 'button' | 'div' = interactive ? 'button' : 'div'
  const wrapperProps = interactive
    ? {
        type: 'button' as const,
        onClick: () => onClick?.(dish.id),
      }
    : {}

  return (
    <Wrapper
      {...wrapperProps}
      className={`group relative flex flex-col overflow-hidden rounded-xl border border-slate-800 bg-[var(--color-surface-2)] text-left transition hover:border-slate-700 hover:bg-[var(--color-surface-3)] ${interactive ? 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60' : ''}`}
    >
      <DishPhotoSlot imageUrl={dish.imageUrl} dishName={dish.name} aspect="photo" />

      {dish.isFeatured && (
        <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-300">
          <Star className="h-3 w-3" />
          Featured
        </span>
      )}
      <div className="pointer-events-none absolute right-2 top-2">
        <PriceLabel
          price={dish.price}
          portionSize={dish.portionSize}
          portionUnit={dish.portionUnit}
          tone="overlay"
        />
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3
            className="leading-tight text-[color:var(--color-cream)]"
            style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 600 }}
          >
            {dish.name}
          </h3>
          {portion && (
            <span className="shrink-0 font-mono text-[10px] font-medium tabular-nums text-slate-400">
              {portion}
            </span>
          )}
        </div>

        <NutritionBadges nutrition={dish.nutrition} />

        {dish.tags.length > 0 && (
          <div className="mt-auto pt-1">
            <CBSTags tags={dish.tags} max={4} />
          </div>
        )}
      </div>
    </Wrapper>
  )
}
