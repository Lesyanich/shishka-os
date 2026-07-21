import { PackageSearch, Info } from 'lucide-react'
import {
  useStockOutflow,
  BUCKET_LABELS,
  type OutflowBucket,
} from '../hooks/useStockOutflow'

const RANGES = [7, 30, 90] as const

const BUCKET_ORDER: OutflowBucket[] = ['sale', 'comp', 'staff', 'waste', 'other']

const BUCKET_TEXT: Record<OutflowBucket, string> = {
  sale: 'text-emerald-300',
  comp: 'text-violet-300',
  staff: 'text-sky-300',
  waste: 'text-rose-300',
  other: 'text-slate-300',
}

function baht(n: number): string {
  return `฿${Math.round(n).toLocaleString('en-US')}`
}

function qtyFmt(n: number): string {
  if (n === 0) return '—'
  return n >= 100 ? n.toFixed(0) : n.toFixed(2)
}

export function StockControlReport() {
  const { rows, summary, sinceDays, setSinceDays, isLoading, error } = useStockOutflow(30)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <PackageSearch className="h-5 w-5 text-emerald-400" />
            <h1 className="text-lg font-bold text-slate-100">Stock Control</h1>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Where stock went over the period — sales, comps, staff and waste — valued at cost.
          </p>
        </div>

        {/* Range selector */}
        <div className="flex gap-1 rounded-lg border border-slate-800 bg-slate-900/50 p-1">
          {RANGES.map((d) => (
            <button
              key={d}
              onClick={() => setSinceDays(d)}
              className={[
                'rounded-md px-3 py-1 text-xs font-medium transition',
                sinceDays === d
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'text-slate-400 hover:text-slate-200',
              ].join(' ')}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Total consumed</p>
          <p className="mt-1 text-lg font-bold text-slate-100">{baht(summary.totalCost)}</p>
        </div>
        {BUCKET_ORDER.map((b) => (
          <div key={b} className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">{BUCKET_LABELS[b]}</p>
            <p className={['mt-1 text-lg font-bold', BUCKET_TEXT[b]].join(' ')}>
              {baht(summary.costByBucket[b])}
            </p>
          </div>
        ))}
      </div>

      {/* Honest-accuracy note */}
      <div className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-[11px] text-slate-500">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-600" />
        <span>
          Outflow is the theoretical-consumption ledger (BOM exploded per sale + write-offs).
          On-hand reflects purchases minus waste — sale deduction is audit-only until perpetual
          deduction ships, so compare against a physical stocktake to read true shrinkage.
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-9 animate-pulse rounded bg-slate-800/50" />
            ))}
          </div>
        ) : error ? (
          <div className="p-4 text-center text-xs text-rose-300">{error}</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">
            No stock movements in the last {sinceDays} days.
          </div>
        ) : (
          <div className="max-h-[600px] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-slate-900">
                <tr className="border-b border-slate-800 text-left text-slate-500">
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 text-right font-medium">Sales</th>
                  <th className="px-3 py-2 text-right font-medium">Comps</th>
                  <th className="px-3 py-2 text-right font-medium">Staff</th>
                  <th className="px-3 py-2 text-right font-medium">Waste</th>
                  <th className="px-3 py-2 text-right font-medium">Total cost</th>
                  <th className="px-3 py-2 text-right font-medium">On-hand</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.nomenclature_id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="px-3 py-2">
                      <p className="font-medium text-slate-200">{r.name}</p>
                      <p className="text-[10px] text-slate-600">{r.product_code}</p>
                    </td>
                    <td className="px-3 py-2 text-right text-slate-400">
                      {qtyFmt(r.qty.sale)}
                      {r.cost.sale > 0 && <span className="ml-1 text-[10px] text-emerald-400/70">{baht(r.cost.sale)}</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-400">
                      {qtyFmt(r.qty.comp)}
                      {r.cost.comp > 0 && <span className="ml-1 text-[10px] text-violet-400/70">{baht(r.cost.comp)}</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-400">
                      {qtyFmt(r.qty.staff)}
                      {r.cost.staff > 0 && <span className="ml-1 text-[10px] text-sky-400/70">{baht(r.cost.staff)}</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-400">
                      {qtyFmt(r.qty.waste)}
                      {r.cost.waste > 0 && <span className="ml-1 text-[10px] text-rose-400/70">{baht(r.cost.waste)}</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-200">
                      {r.cost_per_unit != null ? baht(r.totalCost) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-500">
                      {qtyFmt(r.onHand)}
                      {r.base_unit ? <span className="ml-0.5 text-[10px] text-slate-600">{r.base_unit}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
