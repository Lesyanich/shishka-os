import { Star, AlertTriangle, Clock } from 'lucide-react'
import type { DishSummary, PortionUnit } from './types'
import { NutritionBadges } from './NutritionBadges'
import { CBSTags } from './CBSTags'
import { PriceLabel } from './PriceLabel'
import { DishPhotoSlot } from './DishPhotoSlot'

const ALLERGEN_PALETTE: Record<string, string> = {
  'allergen-gluten': 'bg-amber-900/40 text-amber-300',
  'allergen-dairy': 'bg-sky-900/40 text-sky-300',
  'allergen-nuts': 'bg-orange-900/40 text-orange-300',
  'allergen-shellfish': 'bg-rose-900/40 text-rose-300',
  'allergen-soy': 'bg-lime-900/40 text-lime-300',
  'allergen-eggs': 'bg-yellow-900/40 text-yellow-300',
  'allergen-egg': 'bg-yellow-900/40 text-yellow-300',
  'allergen-fish': 'bg-cyan-900/40 text-cyan-300',
  'allergen-sesame': 'bg-stone-800/60 text-stone-300',
}
const ALLERGEN_DEFAULT = 'bg-slate-800 text-slate-300'

function allergenLabel(slug: string): string {
  const raw = slug.replace(/^allergen-/, '')
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

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
  // Coming soon / out of stock: keep the card visible but non-orderable.
  const unavailable = dish.stockState != null && dish.stockState !== 'in_stock'
  const stockLabel = dish.stockState === 'out_of_stock' ? 'Out of stock' : 'Coming soon'
  const interactive = onClick != null && !unavailable

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
      aria-disabled={unavailable || undefined}
      className={`group relative flex flex-col overflow-hidden rounded-xl border border-slate-800 bg-[var(--color-surface-2)] text-left transition hover:border-slate-700 hover:bg-[var(--color-surface-3)] ${interactive ? 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60' : ''} ${unavailable ? 'opacity-60 saturate-50' : ''}`}
    >
      <DishPhotoSlot imageUrl={dish.imageUrl} dishName={dish.name} aspect="photo" />

      {unavailable && (
        <span className="pointer-events-none absolute right-2 bottom-2 z-10 inline-flex items-center rounded-full bg-slate-900/85 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cream ring-1 ring-white/15 backdrop-blur">
          {stockLabel}
        </span>
      )}

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

        {dish.allergens && dish.allergens.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <AlertTriangle className="h-2.5 w-2.5 shrink-0 text-amber-400" />
            {dish.allergens.map((slug) => (
              <span
                key={slug}
                className={`inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-medium ${ALLERGEN_PALETTE[slug] ?? ALLERGEN_DEFAULT}`}
                title={`Contains ${allergenLabel(slug)}`}
              >
                {allergenLabel(slug)}
              </span>
            ))}
          </div>
        )}

        {dish.modifiers && dish.modifiers.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {dish.modifiers.map((m) => (
              <span
                key={m.slug}
                className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                  m.isDefault
                    ? 'bg-[var(--color-royal-green)]/20 text-[color:var(--color-forest-soft)]'
                    : 'bg-surface-3 text-cream/70'
                }`}
              >
                +{m.name}
                {m.priceDelta !== 0 && (
                  <span className="font-mono tabular-nums opacity-75">
                    {m.priceDelta > 0 ? `+฿${m.priceDelta}` : `-฿${Math.abs(m.priceDelta)}`}
                  </span>
                )}
              </span>
            ))}
          </div>
        )}

        {dish.etaMin != null && (
          <div className="flex items-center gap-1 text-[10px] text-cream/55">
            <Clock className="h-2.5 w-2.5" />
            <span>~{dish.etaMin} min</span>
          </div>
        )}

        {dish.tags.length > 0 && (
          <div className="mt-auto pt-1">
            <CBSTags tags={dish.tags} max={4} />
          </div>
        )}
      </div>
    </Wrapper>
  )
}
