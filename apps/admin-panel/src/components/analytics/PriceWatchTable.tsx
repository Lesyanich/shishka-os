import { AlertTriangle, TrendingUp } from 'lucide-react'
import { formatTHBFull } from '../finance/helpers'
import type { PriceWatchRow, PriceWatchView } from '../../lib/analyticsPurchases'

/* ═══════════════════════════════════════════════════════════════════
   PriceWatchTable — items whose last unit price sits more than 10 %
   above their 8-week median (spec §5 Tab 2).

   Two honesty constraints, both measured on prod:
   · 18 of 25 rows have no resolved pack size, so their unit price is
     in purchase units and comparing it is meaningless. Those spikes
     are listed apart, never mixed into the actionable ones.
   · The view carries its own rolling 8-week window, so this panel
     does NOT follow the period selector. It says so.
   ═══════════════════════════════════════════════════════════════════ */

export interface PriceWatchTableProps {
  view: PriceWatchView
  isLoading: boolean
}

function Row({ r, muted }: { r: PriceWatchRow; muted?: boolean }) {
  return (
    <tr
      className="border-b border-[var(--line)] transition last:border-0 hover:bg-[var(--s-2)]"
      style={{ transitionTimingFunction: 'var(--e-out)' }}
    >
      <td className="max-w-[200px] px-4 py-2" title={r.product_code}>
        <span className={`block truncate text-xs ${muted ? 'text-cream/60' : 'text-cream'}`}>
          {r.item_name}
        </span>
        <span className="block truncate text-[10px] text-cream/60">
          {r.supplier_name ?? 'no supplier'}
          {r.count_class && ` · class ${r.count_class}`}
        </span>
      </td>
      <td className="px-2 py-2 text-right font-mono text-xs tabular-nums text-cream">
        {r.last_unit_price === null ? '—' : formatTHBFull(r.last_unit_price)}
        <span className="ml-1 text-[10px] text-cream/60">/{r.base_unit}</span>
      </td>
      <td className="px-2 py-2 text-right font-mono text-xs tabular-nums text-cream/60">
        {r.median_unit_price_8w === null ? '—' : formatTHBFull(r.median_unit_price_8w)}
      </td>
      <td className="px-2 py-2 text-right">
        <span className="inline-flex items-center gap-0.5 font-mono text-xs tabular-nums text-brick-bright">
          <TrendingUp className="h-3 w-3" />+{(r.delta_pct ?? 0).toFixed(1)}%
        </span>
      </td>
      <td className="px-4 py-2 text-right font-mono text-[11px] tabular-nums text-cream/60">
        {r.last_invoice_date ?? '—'}
      </td>
    </tr>
  )
}

function Head() {
  return (
    <thead>
      <tr className="border-b border-[var(--line)]">
        <th className="px-4 py-2 text-left text-[10px] font-medium uppercase tracking-[0.12em] text-cream/60">
          Item
        </th>
        <th className="px-2 py-2 text-right text-[10px] font-medium uppercase tracking-[0.12em] text-cream/60">
          Last
        </th>
        <th className="px-2 py-2 text-right text-[10px] font-medium uppercase tracking-[0.12em] text-cream/60">
          8w median
        </th>
        <th className="px-2 py-2 text-right text-[10px] font-medium uppercase tracking-[0.12em] text-cream/60">
          Δ
        </th>
        <th className="px-4 py-2 text-right text-[10px] font-medium uppercase tracking-[0.12em] text-cream/60">
          Invoice
        </th>
      </tr>
    </thead>
  )
}

export function PriceWatchTable({ view, isLoading }: PriceWatchTableProps) {
  const noSpikes =
    view.comparableSpikes.length === 0 && view.unknownPackSpikes.length === 0

  return (
    <div className="flex flex-col shk-panel">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <h2 className="text-sm font-semibold text-cream">Price watch</h2>
        <p className="text-xs text-cream/60">
          Last price more than 10% over the 8-week median ·{' '}
          <span className="text-amber-watch">rolling 8 weeks — not affected by the period above</span>
        </p>
      </div>

      <div className="flex-1 overflow-x-auto">
        {isLoading ? (
          <div className="space-y-2 px-4 py-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-8 animate-pulse rounded bg-[var(--s-2)]" />
            ))}
          </div>
        ) : noSpikes ? (
          <div className="flex h-32 flex-col items-center justify-center gap-1 text-xs text-cream/60">
            <span>No price spikes in the last 8 weeks</span>
            <span className="text-[10px]">
              {view.comparableRows} of {view.totalRows} items have a comparable unit price
            </span>
          </div>
        ) : (
          <>
            {view.comparableSpikes.length > 0 && (
              <table className="w-full">
                <Head />
                <tbody>
                  {view.comparableSpikes.map((r) => (
                    <Row key={r.nomenclature_id} r={r} />
                  ))}
                </tbody>
              </table>
            )}

            {view.unknownPackSpikes.length > 0 && (
              <>
                <p className="flex items-start gap-1.5 border-t border-[var(--line)] bg-[var(--s-2)]/40 px-4 py-2 text-[10px] leading-snug text-amber-watch">
                  <AlertTriangle className="mt-px h-3 w-3 flex-shrink-0" />
                  <span>
                    Pack size unresolved on these — the quantity is in purchase units, not{' '}
                    {view.unknownPackSpikes[0].base_unit}, so the price per unit is not comparable.
                    Treat the Δ as a hint, not a fact.
                  </span>
                </p>
                <table className="w-full">
                  <tbody>
                    {view.unknownPackSpikes.map((r) => (
                      <Row key={r.nomenclature_id} r={r} muted />
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}
      </div>

      {!isLoading && (
        <p className="border-t border-[var(--line)] px-4 py-2 text-[10px] leading-snug text-cream/60">
          {view.comparableRows} of {view.totalRows} watched items have a resolved pack size.{' '}
          {view.noMedianYet > 0 && (
            <>
              {view.noMedianYet} have been bought in only one week so far, where the “median” is
              simply that single price and no spike can show up yet.
            </>
          )}
        </p>
      )}
    </div>
  )
}
