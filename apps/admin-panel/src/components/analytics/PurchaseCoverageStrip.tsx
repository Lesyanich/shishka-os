import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatTHBFull } from '../finance/helpers'
import { weekLabel, type PeriodRange } from '../../lib/analytics'
import { CANONICAL_PCT_TRUSTWORTHY, type CoverageTotals } from '../../lib/analyticsPurchases'

/* ═══════════════════════════════════════════════════════════════════
   PurchaseCoverageStrip — the honesty header of the Purchases tab
   (spec §5 Tab 2): how much of the money this tab can actually
   attribute to a real item.

   Deliberately NOT a shared component with the Sales pulse strip:
   that one is typed to sales totals, the facts here are different,
   and generalising it would mean editing the Sales pulse tab, which
   this task's scope excludes. Two call sites; an abstraction earns
   its place at three (RULE-MINIMAL-CORRECT-CHANGE).
   ═══════════════════════════════════════════════════════════════════ */

export interface PurchaseCoverageStripProps {
  range: PeriodRange
  totals: CoverageTotals
  isLoading: boolean
  onRefresh: () => void
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-[10px] uppercase tracking-[0.12em] text-cream/60">{label}</span>
      <span className="font-mono text-xs font-semibold tabular-nums text-cream">{value}</span>
    </span>
  )
}

export function PurchaseCoverageStrip({
  range,
  totals,
  isLoading,
  onRefresh,
}: PurchaseCoverageStripProps) {
  const untrustworthy = totals.thbTotal > 0 && totals.canonicalPct < CANONICAL_PCT_TRUSTWORTHY

  return (
    <div className="space-y-2 rounded-xl border border-[var(--line)] bg-[var(--s-1)] px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {isLoading ? (
          <div className="h-4 w-80 animate-pulse rounded bg-[var(--s-2)]" />
        ) : (
          <>
            <Fact
              label="Period"
              value={`${range.weeks}w · ${weekLabel(range.start)} – ${weekLabel(range.end)}`}
            />
            <Fact label="Purchased" value={`฿${formatTHBFull(totals.thbTotal)}`} />
            <Fact
              label="On canonical items"
              value={`${totals.canonicalPct.toFixed(1)}%`}
            />
            <Fact label="Lines" value={`${totals.canonicalLines} of ${totals.linesTotal}`} />
            {totals.unmatchedInPeriod > 0 && (
              <Fact label="Awaiting match" value={String(totals.unmatchedInPeriod)} />
            )}
          </>
        )}

        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          title="Reload from the analytics views"
          className="ml-auto flex items-center gap-1.5 rounded-md border border-[var(--line)] px-2 py-1 text-[10px] font-medium text-cream/60 transition hover:bg-[var(--s-2)] hover:text-cream disabled:opacity-40"
          style={{ transitionTimingFunction: 'var(--e-out)' }}
        >
          <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {!isLoading && untrustworthy && (
        <p className="flex items-start gap-1.5 text-[10px] leading-snug text-amber-watch">
          <AlertTriangle className="mt-px h-3 w-3 flex-shrink-0" />
          <span>
            Only{' '}
            <strong className="font-semibold">{totals.canonicalPct.toFixed(1)}%</strong> of this
            period&apos;s purchase money lands on a real item — the rest sits on{' '}
            <strong className="font-semibold">{totals.stubLines}</strong> auto-created stub lines
            that reach no recipe. Spend totals below are complete; <em>what</em> the money bought is
            only knowable for that {totals.canonicalPct.toFixed(0)}%. Work the{' '}
            <Link
              to="/procurement"
              className="underline decoration-dotted underline-offset-2 hover:text-cream"
            >
              unmatched queue
            </Link>{' '}
            to raise it.
            {totals.unmatchedInPeriod > 0 && (
              <>
                {' '}
                <span className="text-cream/60">
                  ({totals.unmatchedInPeriod} lines first seen in this period are still unmatched;
                  the full queue is larger.)
                </span>
              </>
            )}
          </span>
        </p>
      )}
    </div>
  )
}
