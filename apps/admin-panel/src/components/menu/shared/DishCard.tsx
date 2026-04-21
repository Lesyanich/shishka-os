import { Star } from 'lucide-react'
import type { DishSummary, PortionUnit } from './types'
import { NutritionBadges } from './NutritionBadges'
import { CBSTags } from './CBSTags'
import { PriceLabel } from './PriceLabel'
import { DishPhotoSlot } from './DishPhotoSlot'

interface DishCardProps {
  dish: DishSummary
  onClick?: (id: string) => void
  /** 'full' admin, 'reduced' customer (cal + dominant macro). Default 'full'. */
  nutritionMode?: 'full' | 'reduced'
  /** Small text above the name — typically category. Customer variant. */
  categoryLabel?: string
  /** Optional quality score (0–100); renders as a compact pill next to the
   * price. Wired when the Dish Quality Scorecard sub-task lands. */
  qualityScore?: number | null
  /** Description line shown under the name (customer variant). */
  description?: string | null
}

function formatPortion(size: number | null, unit: PortionUnit | null): string | null {
  if (size == null || unit == null) return null
  if (unit === 'pcs') return size === 1 ? '1 pc' : `${size} pcs`
  return `${size}${unit}`
}

function scoreTone(score: number): string {
  if (score >= 85) return 'bg-[var(--color-royal-green)]/25 text-[color:var(--color-forest-soft)] ring-[var(--color-forest-soft)]/50'
  if (score >= 70) return 'bg-[var(--color-amber-watch)]/20 text-[color:var(--color-amber-watch)] ring-[var(--color-amber-watch)]/50'
  return 'bg-[var(--color-royal-red)]/20 text-[color:var(--color-brick-soft)] ring-[var(--color-brick-soft)]/50'
}

export function DishCard({
  dish,
  onClick,
  nutritionMode = 'full',
  categoryLabel,
  qualityScore,
  description,
}: DishCardProps) {
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
      <div className="pointer-events-none absolute right-2 top-2 flex items-end gap-2">
        <PriceLabel
          price={dish.price}
          portionSize={dish.portionSize}
          portionUnit={dish.portionUnit}
          tone="overlay"
        />
        {qualityScore != null && (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold tabular-nums ring-1 ring-inset ${scoreTone(qualityScore)}`}
            title={`Quality score ${qualityScore}/100`}
          >
            {Math.round(qualityScore)}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        {categoryLabel && (
          <span
            className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-cream)]/50"
            style={{ fontFamily: 'var(--font-display-sc)' }}
          >
            {categoryLabel}
          </span>
        )}
        <div className="flex items-baseline justify-between gap-2">
          <h3
            className="leading-tight text-[color:var(--color-cream)]"
            style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 500 }}
          >
            {dish.name}
          </h3>
          {portion && (
            <span className="shrink-0 font-mono text-[10px] font-medium tabular-nums text-slate-400">
              {portion}
            </span>
          )}
        </div>

        {description && (
          <p
            className="text-xs leading-snug text-[color:var(--color-cream)]/70 line-clamp-3"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            {description}
          </p>
        )}

        <NutritionBadges nutrition={dish.nutrition} mode={nutritionMode} />

        {dish.tags.length > 0 && (
          <div className="mt-auto pt-1">
            <CBSTags tags={dish.tags} max={4} />
          </div>
        )}
      </div>
    </Wrapper>
  )
}
