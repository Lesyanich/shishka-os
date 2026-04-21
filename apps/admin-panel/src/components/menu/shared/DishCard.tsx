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
  if (score >= 85) return 'text-forest-soft'
  if (score >= 70) return 'text-amber-watch'
  return 'text-brick-soft'
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
      className={`group relative flex flex-col overflow-hidden rounded-xl border border-surface-3 bg-surface-2 text-left transition hover:border-surface-3/80 hover:bg-surface-3 ${interactive ? 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brick-soft/60' : ''}`}
    >
      <DishPhotoSlot imageUrl={dish.imageUrl} dishName={dish.name} aspect="photo" />

      {dish.isFeatured && (
        <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-amber-watch/25 px-2 py-0.5 text-[10px] font-medium text-amber-watch">
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
            className={`inline-flex items-center font-mono text-[11px] font-semibold tabular-nums ${scoreTone(qualityScore)}`}
            title={`Quality score ${qualityScore}/100`}
          >
            {(qualityScore / 10).toFixed(1)} / 10
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        {categoryLabel && (
          <span
            className="text-[10px] uppercase tracking-[0.14em] text-brick-soft"
            style={{ fontFamily: 'var(--font-display-sc)', fontWeight: 700 }}
          >
            &mdash; {categoryLabel} &mdash;
          </span>
        )}
        <div className="flex items-baseline justify-between gap-2">
          <h3
            className="leading-tight text-cream"
            style={{ fontFamily: 'var(--font-display)', fontSize: '21px', fontWeight: 500 }}
          >
            {dish.name}
          </h3>
          {portion && (
            <span className="shrink-0 font-mono text-[10px] font-medium tabular-nums text-muted">
              {portion}
            </span>
          )}
        </div>

        {description && (
          <p
            className="text-[12.5px] leading-relaxed text-muted line-clamp-3"
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
