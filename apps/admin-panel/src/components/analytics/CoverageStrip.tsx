import { RefreshCw } from 'lucide-react'
import { formatTHBFull } from '../finance/helpers'
import { daysInclusive, weekLabel, type PeriodRange, type SalesTotals } from '../../lib/analytics'

/* ═══════════════════════════════════════════════════════════
   CoverageStrip — the one-line honesty header each /analytics
   tab opens with (spec §5): what share of reality this tab can
   actually see. On the sales tab there is no canonical-vs-stub
   money question, so it states the window, how much of it
   traded, and that revenue is quoted gross.
   ═══════════════════════════════════════════════════════════ */

export interface CoverageStripProps {
  range: PeriodRange
  totals: SalesTotals
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

export function CoverageStrip({ range, totals, isLoading, onRefresh }: CoverageStripProps) {
  const calendarDays = daysInclusive(range.start, range.end)

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-[var(--line)] bg-[var(--s-1)] px-4 py-2.5">
      {isLoading ? (
        <div className="h-4 w-72 animate-pulse rounded bg-[var(--s-2)]" />
      ) : (
        <>
          <Fact
            label="Period"
            value={`${range.label} · ${weekLabel(range.start)} – ${weekLabel(range.end)}`}
          />
          <Fact label="Trading days" value={`${totals.tradingDays} / ${calendarDays}`} />
          <Fact label="Receipts" value={String(totals.receipts)} />
          <Fact label="Gross" value={`฿${formatTHBFull(totals.gross)}`} />
          {totals.refunds > 0 && (
            <Fact label="Refunds" value={`฿${formatTHBFull(totals.refunds)}`} />
          )}
          <span className="text-[10px] leading-snug text-cream/60">
            Revenue is quoted <strong className="font-semibold text-cream/80">gross</strong>; refunds
            are charted separately, never netted away silently. The newest week is still in progress.
          </span>
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
  )
}
