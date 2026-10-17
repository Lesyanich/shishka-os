import { AlertTriangle, RefreshCw } from 'lucide-react'
import { COUNT_STALE_DAYS, type CountCoverage } from '../../lib/analyticsStock'

/* ═══════════════════════════════════════════════════════════════════
   StockCoverageStrip — what this tab can and cannot see (spec §5
   Tab 3): the last count, how much of it, waste entries, BOM coverage.

   It reports only what the allowed views can source. The share of the
   A-class universe that was counted is NOT shown, because the A-item
   denominator lives in `nomenclature`, which this tab does not read —
   quoting a number the app cannot derive would be worse than omitting
   it.
   ═══════════════════════════════════════════════════════════════════ */

export interface StockCoverageStripProps {
  coverage: CountCoverage
  daysSinceCount: number | null
  wasteEntries: number
  bomCoveragePct: number | null
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

export function StockCoverageStrip({
  coverage,
  daysSinceCount,
  wasteEntries,
  bomCoveragePct,
  isLoading,
  onRefresh,
}: StockCoverageStripProps) {
  const stale = daysSinceCount !== null && daysSinceCount > COUNT_STALE_DAYS

  return (
    <div className="space-y-2 rounded-xl border border-[var(--line)] bg-[var(--s-1)] px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {isLoading ? (
          <div className="h-4 w-80 animate-pulse rounded bg-[var(--s-2)]" />
        ) : (
          <>
            <Fact label="Last count" value={coverage.latestCountDay ?? 'never'} />
            {daysSinceCount !== null && <Fact label="Age" value={`${daysSinceCount} days`} />}
            <Fact label="Items counted" value={String(coverage.itemsCounted)} />
            <Fact label="A-class" value={String(coverage.aClassCounted)} />
            <Fact label="Count days" value={String(coverage.countDays)} />
            <Fact label="Waste entries" value={String(wasteEntries)} />
            <Fact
              label="BOM coverage"
              value={bomCoveragePct === null ? '—' : `${bomCoveragePct.toFixed(1)}%`}
            />
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

      {!isLoading && (stale || !coverage.hasInterval || wasteEntries === 0) && (
        <p className="flex items-start gap-1.5 text-[10px] leading-snug text-amber-watch">
          <AlertTriangle className="mt-px h-3 w-3 flex-shrink-0" />
          <span>
            {!coverage.hasInterval && (
              <>
                Variance needs two count days and there {coverage.countDays === 1 ? 'is' : 'are'}{' '}
                <strong className="font-semibold">{coverage.countDays}</strong>.{' '}
              </>
            )}
            {stale && (
              <>
                The last count is <strong className="font-semibold">{daysSinceCount} days</strong>{' '}
                old, so the inventory value below describes that day, not today&apos;s shelves.{' '}
              </>
            )}
            {wasteEntries === 0 && <>No waste has been logged at all, so nothing is deducted for it.</>}
          </span>
        </p>
      )}
    </div>
  )
}
