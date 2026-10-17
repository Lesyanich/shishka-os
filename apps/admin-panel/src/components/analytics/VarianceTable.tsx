import { CalendarClock, Info } from 'lucide-react'
import { formatTHBFull } from '../finance/helpers'
import { VARIANCE_TONE_CLASS, varianceToneReason } from '../../lib/analyticsThresholds'
import type { CountCoverage, VarianceRowView } from '../../lib/analyticsStock'

/* ═══════════════════════════════════════════════════════════════════
   VarianceTable — the hero of the Stock control tab (spec §5 Tab 3):
   opening + purchases − usage − waste = expected, against what was
   actually counted.

   On prod today it renders NOTHING, because a variance interval needs
   two count days and there is one (2026-09-01). That empty state is
   the honest answer and it names the reason: the second count is a
   floor process (spec §0.2, Nene's), not a missing feature. The full
   table below it is written and tested against a synthetic interval,
   so the first real interval lights it up with no further code.
   ═══════════════════════════════════════════════════════════════════ */

export interface VarianceTableProps {
  rows: VarianceRowView[]
  droppedIncomplete: number
  interval: { from: string; to: string } | null
  coverage: CountCoverage
  isLoading: boolean
}

function Num({ value, unit }: { value: number; unit?: string }) {
  return (
    <span className="font-mono text-xs tabular-nums text-cream/80">
      {Number.isInteger(value) ? value : value.toFixed(3).replace(/\.?0+$/, '')}
      {unit && <span className="ml-0.5 text-[9px] text-cream/60">{unit}</span>}
    </span>
  )
}

export function VarianceTable({
  rows,
  droppedIncomplete,
  interval,
  coverage,
  isLoading,
}: VarianceTableProps) {
  return (
    <div className="flex flex-col shk-panel">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <h2 className="text-sm font-semibold text-cream">Stock variance</h2>
        <p className="text-xs text-cream/60">
          {interval
            ? `Count to count · ${interval.from} → ${interval.to} · sorted by money, largest first`
            : 'Expected closing stock against what was counted, per A-class item'}
        </p>
      </div>

      <div className="flex-1">
        {isLoading ? (
          <div className="space-y-2 px-4 py-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-6 animate-pulse rounded bg-[var(--s-2)]" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          /* Not a spinner, not a zero, not a blank panel — the reason. */
          <div className="flex flex-col gap-3 px-5 py-6">
            <div className="flex items-start gap-3">
              <CalendarClock className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-watch" aria-hidden />
              <div>
                <p className="text-sm font-semibold text-cream">
                  Waiting on a second stock count
                </p>
                <p className="mt-1 text-xs leading-relaxed text-cream/80">
                  Variance is measured between two counts — what the shelves held, what came in,
                  what the till sold, what was binned, against what the next count actually found.
                  {coverage.latestCountDay ? (
                    <>
                      {' '}
                      Prod has <strong className="font-semibold">one</strong> count day so far:{' '}
                      <span className="font-mono text-cream">{coverage.latestCountDay}</span>
                      {coverage.itemsCounted > 0 && (
                        <>
                          {' '}
                          ({coverage.itemsCounted} items, {coverage.aClassCounted} of them A-class)
                        </>
                      )}
                      . One count is a starting line, not an interval.
                    </>
                  ) : (
                    <> No stock count has been recorded yet.</>
                  )}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-cream/60">
                  Nothing in the app can produce the second count — it is a weekly floor routine
                  (Nene&apos;s, spec §0.2). Once it lands this table fills itself in: the columns,
                  the arithmetic and the colour thresholds are already built and tested.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[var(--line)]">
                  {['Item', 'Opening', '+ Bought', '− Used', '− Waste', '= Expected', 'Counted', 'Variance', '%'].map(
                    (h, i) => (
                      <th
                        key={h}
                        className={`px-2 py-2 text-[10px] font-medium uppercase tracking-[0.12em] text-cream/60 ${
                          i === 0 ? 'pl-4 text-left' : 'text-right'
                        } ${i === 8 ? 'pr-4' : ''}`}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.nomenclature_id}
                    className="border-b border-[var(--line)] transition last:border-0 hover:bg-[var(--s-2)]"
                    style={{ transitionTimingFunction: 'var(--e-out)' }}
                  >
                    <td className="max-w-[220px] truncate pl-4 pr-2 py-2" title={r.product_code}>
                      <span className="text-xs text-cream">{r.item_name}</span>
                      {r.count_class && (
                        <span className="ml-1.5 text-[9px] uppercase text-honey-300">
                          {r.count_class}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right"><Num value={r.opening_qty} /></td>
                    <td className="px-2 py-2 text-right"><Num value={r.purchases_qty} /></td>
                    <td className="px-2 py-2 text-right"><Num value={r.usage_qty} /></td>
                    <td className="px-2 py-2 text-right"><Num value={r.waste_qty} /></td>
                    <td className="px-2 py-2 text-right"><Num value={r.expected_closing_qty} /></td>
                    <td className="px-2 py-2 text-right"><Num value={r.closing_qty} unit={r.base_unit} /></td>
                    <td
                      className={`px-2 py-2 text-right font-mono text-xs font-semibold tabular-nums ${VARIANCE_TONE_CLASS[r.tone]}`}
                      title={varianceToneReason(r.tone)}
                    >
                      {r.variance_thb > 0 ? '−' : '+'}฿{formatTHBFull(Math.abs(r.variance_thb))}
                    </td>
                    <td
                      className={`pr-4 pl-2 py-2 text-right font-mono text-xs tabular-nums ${VARIANCE_TONE_CLASS[r.tone]}`}
                    >
                      {r.variance_pct_of_usage === null
                        ? '—'
                        : `${r.variance_pct_of_usage.toFixed(0)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!isLoading && droppedIncomplete > 0 && (
        <p className="flex items-start gap-1.5 border-t border-[var(--line)] px-4 py-2 text-[10px] leading-snug text-amber-watch">
          <Info className="mt-px h-3 w-3 flex-shrink-0" />
          <span>
            {droppedIncomplete} item{droppedIncomplete === 1 ? '' : 's'} left out: not counted at
            every location it stocks, which would show as a shortage that is really a missing
            count.
          </span>
        </p>
      )}
    </div>
  )
}
