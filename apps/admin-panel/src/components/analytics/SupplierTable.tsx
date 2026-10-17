import { TrendingDown, TrendingUp } from 'lucide-react'
import { formatTHBFull } from '../finance/helpers'
import type { SupplierTotal } from '../../lib/analyticsPurchases'

/* ═══════════════════════════════════════════════════════════════════
   SupplierTable — who the period's purchase money went to (spec §5
   Tab 2), with the change against the previous equal-length window.

   The delta compares WHOLE ISO weeks: these rows are week-bucketed,
   so a day-grain window would silently drop a partial week's spend
   (measured on prod: a 2.2x error in the baseline).
   ═══════════════════════════════════════════════════════════════════ */

export interface SupplierTableProps {
  rows: SupplierTotal[]
  isLoading: boolean
}

export function SupplierTable({ rows, isLoading }: SupplierTableProps) {
  return (
    <div className="flex flex-col shk-panel">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <h2 className="text-sm font-semibold text-cream">Suppliers</h2>
        <p className="text-xs text-cream/60">
          Spend this period · Δ vs the previous {rows.length > 0 ? 'equal' : ''} window of whole
          weeks
        </p>
      </div>

      <div className="flex-1 overflow-x-auto">
        {isLoading ? (
          <div className="space-y-2 px-4 py-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-5 animate-pulse rounded bg-[var(--s-2)]" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-xs text-cream/60">
            No purchases in this period
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[var(--line)]">
                <th className="px-4 py-2 text-[10px] font-medium uppercase tracking-[0.12em] text-cream/60">
                  Supplier
                </th>
                <th className="px-2 py-2 text-right text-[10px] font-medium uppercase tracking-[0.12em] text-cream/60">
                  THB
                </th>
                <th className="px-2 py-2 text-right text-[10px] font-medium uppercase tracking-[0.12em] text-cream/60">
                  Share
                </th>
                <th className="px-2 py-2 text-right text-[10px] font-medium uppercase tracking-[0.12em] text-cream/60">
                  Lines
                </th>
                <th className="px-2 py-2 text-right text-[10px] font-medium uppercase tracking-[0.12em] text-cream/60">
                  Last delivery
                </th>
                <th className="px-4 py-2 text-right text-[10px] font-medium uppercase tracking-[0.12em] text-cream/60">
                  Δ
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.supplier}
                  className="border-b border-[var(--line)] transition last:border-0 hover:bg-[var(--s-2)]"
                  style={{ transitionTimingFunction: 'var(--e-out)' }}
                >
                  <td className="max-w-[220px] truncate px-4 py-2 text-xs text-cream" title={r.supplier}>
                    {r.supplier}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-xs tabular-nums text-cream">
                    {formatTHBFull(r.thb)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-xs tabular-nums text-cream/60">
                    {r.sharePct.toFixed(1)}%
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-xs tabular-nums text-cream/60">
                    {r.lines}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-[11px] tabular-nums text-cream/60">
                    {r.lastInvoice ?? '—'}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {r.deltaPct === undefined ? (
                      <span
                        className="text-[10px] text-cream/60"
                        title="Nothing bought from this supplier in the previous window"
                      >
                        new
                      </span>
                    ) : (
                      <span
                        className={`inline-flex items-center gap-0.5 font-mono text-[11px] tabular-nums ${
                          r.deltaPct > 0 ? 'text-brick-bright' : 'text-mint-200'
                        }`}
                        title={`Previous window: ฿${formatTHBFull(r.prevThb)}`}
                      >
                        {r.deltaPct > 0 ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        {r.deltaPct > 0 ? '+' : ''}
                        {r.deltaPct.toFixed(0)}%
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
