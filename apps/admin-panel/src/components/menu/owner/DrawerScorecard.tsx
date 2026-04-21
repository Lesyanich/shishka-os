import type { DishScorecard, ScorecardAxes } from '../../../hooks/useDishScorecard'
import { SCORECARD_AXIS_LABELS } from '../../../hooks/useDishScorecard'

interface DrawerScorecardProps {
  scorecard: DishScorecard | null
  isLoading: boolean
  error: string | null
}

const AXIS_ORDER: (keyof ScorecardAxes)[] = ['cbs', 'taste', 'nutrient', 'functional', 'cost']

function totalTone(total: number): { ring: string; text: string } {
  if (total >= 8)
    return {
      ring: 'ring-[var(--color-forest-soft)]/60',
      text: 'text-[color:var(--color-forest-soft)]',
    }
  if (total >= 5)
    return {
      ring: 'ring-[var(--color-amber-watch)]/60',
      text: 'text-[color:var(--color-amber-watch)]',
    }
  return {
    ring: 'ring-[var(--color-brick-soft)]/60',
    text: 'text-[color:var(--color-brick-soft)]',
  }
}

function axisBar(score: number) {
  // 0 / 1 / 2 → width + tone
  if (score >= 2) {
    return { width: '100%', tone: 'bg-[var(--color-forest-soft)]' }
  }
  if (score >= 1) {
    return { width: '50%', tone: 'bg-[var(--color-amber-watch)]' }
  }
  return { width: '8%', tone: 'bg-[var(--color-brick-soft)]/60' }
}

export function DrawerScorecard({ scorecard, isLoading, error }: DrawerScorecardProps) {
  return (
    <section aria-labelledby="drawer-scorecard-title" className="space-y-4">
      <div className="flex items-center justify-between">
        <h3
          id="drawer-scorecard-title"
          className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--color-cream)]/60"
          style={{ fontFamily: 'var(--font-display-sc)' }}
        >
          Scorecard
        </h3>
        {scorecard && (
          <span className="font-mono text-[10px] tabular-nums text-[color:var(--color-cream)]/40">
            {scorecard.total}/{scorecard.max}
          </span>
        )}
      </div>

      {isLoading && <div className="text-xs text-slate-500">Scoring…</div>}
      {error && <div className="text-xs text-rose-400">Score unavailable: {error}</div>}

      {scorecard && (
        <>
          {/* Overall — large Alegreya italic */}
          <div
            className={`inline-flex items-baseline gap-2 rounded-full bg-[var(--color-surface-2)] px-4 py-2 ring-1 ring-inset ${totalTone(scorecard.total).ring}`}
          >
            <span
              className={`italic ${totalTone(scorecard.total).text}`}
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '2.25rem',
                lineHeight: 1,
                fontWeight: 500,
              }}
            >
              {scorecard.total}
            </span>
            <span className="font-mono text-[10px] tabular-nums text-[color:var(--color-cream)]/50">
              / {scorecard.max}
            </span>
          </div>

          {/* Axis breakdown */}
          <ul className="space-y-2">
            {AXIS_ORDER.map((key) => {
              const score = scorecard.axes[key]
              const bar = axisBar(score)
              return (
                <li key={key} className="space-y-1">
                  <div className="flex items-baseline justify-between text-[11px]">
                    <span className="text-[color:var(--color-cream)]/75">
                      {SCORECARD_AXIS_LABELS[key]}
                    </span>
                    <span className="font-mono tabular-nums text-[color:var(--color-cream)]/50">
                      {score}/2
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className={`h-full rounded-full transition-[width] duration-500 ${bar.tone}`}
                      style={{ width: bar.width }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>

          {/* Details footnote */}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 pt-1 text-[10px] text-[color:var(--color-cream)]/45">
            <div>
              <dt className="inline">CBS axes </dt>
              <dd className="inline font-mono tabular-nums">
                {scorecard.details.cbs_axes_present}/3
              </dd>
            </div>
            <div>
              <dt className="inline">Taste </dt>
              <dd className="inline font-mono tabular-nums">
                {scorecard.details.taste_count}/5
              </dd>
            </div>
            <div>
              <dt className="inline">Protein </dt>
              <dd className="inline font-mono tabular-nums">
                {scorecard.details.protein_per_100kcal != null
                  ? `${scorecard.details.protein_per_100kcal.toFixed(1)}g/100kcal`
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="inline">FC% </dt>
              <dd className="inline font-mono tabular-nums">
                {scorecard.details.food_cost_pct != null
                  ? `${scorecard.details.food_cost_pct.toFixed(1)}%`
                  : '—'}
              </dd>
            </div>
          </dl>
        </>
      )}
    </section>
  )
}
