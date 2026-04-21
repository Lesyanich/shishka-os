import type { DishSummary } from '../shared/types'
import { DishCard } from '../shared/DishCard'

interface DishGridProps {
  dishes: DishSummary[]
  /** Per-dish category label shown above the name (optional). */
  categoryLabelFor?: (dishId: string) => string | undefined
  /** Per-dish quality score (0–100). Wires when scorecard RPC lands. */
  qualityScoreFor?: (dishId: string) => number | null | undefined
  /** Per-dish marketing copy. */
  descriptionFor?: (dishId: string) => string | null | undefined
  /** Selection handler — drawer on customer site, detail drawer in preview. */
  onSelect?: (id: string) => void
  /** Grid density. `relaxed` for hero sections, `compact` for long lists. */
  density?: 'relaxed' | 'compact'
  /** Empty-state copy. */
  emptyMessage?: string
}

/** Responsive customer-facing card grid on dark surface. Pure
 * presentation — no admin-panel or supabase dependencies. */
export function DishGrid({
  dishes,
  categoryLabelFor,
  qualityScoreFor,
  descriptionFor,
  onSelect,
  density = 'relaxed',
  emptyMessage = 'No dishes available.',
}: DishGridProps) {
  if (dishes.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-[color:var(--color-cream)]/50">
        {emptyMessage}
      </div>
    )
  }

  const colsCls =
    density === 'compact'
      ? 'grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'
      : 'grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'

  return (
    <div className={`grid ${colsCls}`}>
      {dishes.map((dish) => (
        <DishCard
          key={dish.id}
          dish={dish}
          onClick={onSelect}
          nutritionMode="reduced"
          categoryLabel={categoryLabelFor?.(dish.id)}
          qualityScore={qualityScoreFor?.(dish.id) ?? null}
          description={descriptionFor?.(dish.id) ?? null}
        />
      ))}
    </div>
  )
}
