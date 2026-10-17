import { AlertTriangle } from 'lucide-react'
import { formatTHBFull } from '../finance/helpers'
import { TOP_SPEND_LIMIT, type TopSpendView } from '../../lib/analyticsPurchases'

/* ═══════════════════════════════════════════════════════════════════
   TopSpendItems — the biggest purchase lines of the rolling 8 weeks
   (spec §5 Tab 2), with an ABC class badge and a "no BOM" badge for
   items nothing consumes.

   The no-BOM badge comes from bom_structures, a CEO-approved sixth
   source (2026-10-17): without it a list whose whole point is "you
   are buying this and no recipe uses it" has no teeth.

   Like price watch, this view carries its own rolling 8-week window
   and so does NOT follow the period selector. It says so.
   ═══════════════════════════════════════════════════════════════════ */

export interface TopSpendItemsProps {
  view: TopSpendView
  isLoading: boolean
}

function Badge({
  children,
  tone,
  title,
}: {
  children: React.ReactNode
  tone: 'class' | 'stub' | 'nobom'
  title: string
}) {
  const style = {
    class: 'bg-honey-300/15 text-honey-300 ring-honey-300/25',
    stub: 'bg-amber-watch/15 text-amber-watch ring-amber-watch/25',
    nobom: 'bg-brick-bright/12 text-brick-bright ring-brick-bright/25',
  }[tone]

  return (
    <span
      title={title}
      className={`inline-flex flex-shrink-0 items-center rounded px-1.5 py-px text-[9px] font-medium uppercase tracking-wider ring-1 ring-inset ${style}`}
    >
      {children}
    </span>
  )
}

export function TopSpendItems({ view, isLoading }: TopSpendItemsProps) {
  const maxThb = view.items[0]?.thb ?? 0

  return (
    <div className="flex flex-col shk-panel">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <h2 className="text-sm font-semibold text-cream">Top {TOP_SPEND_LIMIT} items by spend</h2>
        <p className="text-xs text-cream/60">
          <span className="text-amber-watch">Rolling 8 weeks — not affected by the period above</span>
        </p>
      </div>

      <div className="flex-1">
        {isLoading ? (
          <div className="space-y-2 px-4 py-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-6 animate-pulse rounded bg-[var(--s-2)]" />
            ))}
          </div>
        ) : view.items.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-xs text-cream/60">
            No purchases in the last 8 weeks
          </div>
        ) : (
          <ol className="divide-y divide-[var(--line)]">
            {view.items.map((item, i) => (
              <li
                key={item.nomenclature_id}
                className="relative px-4 py-2 transition hover:bg-[var(--s-2)]"
                style={{ transitionTimingFunction: 'var(--e-out)' }}
              >
                {/* Proportional bar behind the row — spend at a glance. */}
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 bg-[var(--color-forest-soft)]/10"
                  style={{ width: maxThb > 0 ? `${(item.thb / maxThb) * 100}%` : 0 }}
                />
                <div className="relative flex items-center gap-2">
                  <span className="w-4 flex-shrink-0 font-mono text-[10px] tabular-nums text-cream/60">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-cream" title={item.product_code}>
                    {item.name}
                  </span>

                  {item.countClass && (
                    <Badge tone="class" title="ABC class from rolling 8-week purchase THB">
                      {item.countClass}
                    </Badge>
                  )}
                  {!item.isCanonical && (
                    <Badge
                      tone="stub"
                      title="Auto-created stub item — the purchase is not attributed to a real nomenclature record yet"
                    >
                      stub
                    </Badge>
                  )}
                  {item.hasBom === false && (
                    <Badge tone="nobom" title="No recipe consumes this item">
                      no BOM
                    </Badge>
                  )}

                  <span className="w-16 flex-shrink-0 text-right font-mono text-xs tabular-nums text-cream">
                    {formatTHBFull(item.thb)}
                  </span>
                  <span className="w-8 flex-shrink-0 text-right font-mono text-[10px] tabular-nums text-cream/60">
                    {item.lines}×
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {!isLoading && view.items.length > 0 && view.stubCount > 0 && (
        <p className="flex items-start gap-1.5 border-t border-[var(--line)] px-4 py-2 text-[10px] leading-snug text-amber-watch">
          <AlertTriangle className="mt-px h-3 w-3 flex-shrink-0" />
          <span>
            <strong className="font-semibold">
              {view.stubCount} of {view.items.length}
            </strong>{' '}
            of the biggest purchase lines are auto-created stubs that no recipe consumes, and only{' '}
            <strong className="font-semibold">{view.classedCount}</strong> carry an ABC class. This
            list is mostly telling you what the backfill has not reached yet, not what the kitchen
            actually uses — duplicates like three separate lamb entries at the same price are the
            same problem.
          </span>
        </p>
      )}
    </div>
  )
}
