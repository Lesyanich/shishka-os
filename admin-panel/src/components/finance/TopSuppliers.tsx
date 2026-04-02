import { useMemo, useState } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { ExpenseRow } from '../../hooks/useExpenseLedger'

/* ═══════════════════════════════════════════════════════
   TopSuppliers — ranked table of top N suppliers
   Shows total spend, transaction count, avg ticket,
   and month-over-month trend indicator.
   ═══════════════════════════════════════════════════════ */

export interface TopSuppliersProps {
  rows: ExpenseRow[]
  isLoading: boolean
  limit?: number
}

interface SupplierStat {
  name: string
  total: number
  count: number
  avg: number
  /** MoM trend: positive = spending up, negative = spending down */
  trend: number
}

export function TopSuppliers({ rows, isLoading, limit = 8 }: TopSuppliersProps) {
  const [showAll, setShowAll] = useState(false)

  const stats: SupplierStat[] = useMemo(() => {
    // Current & previous month keys
    const now = new Date()
    const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`

    const map = new Map<
      string,
      { total: number; count: number; curMonth: number; prevMonth: number }
    >()

    for (const r of rows) {
      const name = r.supplier_name ?? 'Unknown'
      const entry = map.get(name) ?? { total: 0, count: 0, curMonth: 0, prevMonth: 0 }
      entry.total += r.amount_thb
      entry.count += 1
      if (r.transaction_date.startsWith(curKey)) entry.curMonth += r.amount_thb
      if (r.transaction_date.startsWith(prevKey)) entry.prevMonth += r.amount_thb
      map.set(name, entry)
    }

    return Array.from(map.entries())
      .map(([name, { total, count, curMonth, prevMonth }]) => ({
        name,
        total,
        count,
        avg: total / count,
        trend: prevMonth > 0 ? ((curMonth - prevMonth) / prevMonth) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total)
  }, [rows])

  const displayed = showAll ? stats : stats.slice(0, limit)
  const grandTotal = rows.reduce((s, r) => s + r.amount_thb, 0) || 1

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 animate-pulse rounded bg-slate-800/50" />
        ))}
      </div>
    )
  }

  if (stats.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-slate-500">
        No supplier data
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <h3 className="text-sm font-semibold text-slate-300">Top Suppliers</h3>
        <span className="text-[10px] text-slate-500">{stats.length} suppliers</span>
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        <table className="w-full text-left text-[11px]">
          <thead>
            <tr className="text-[9px] uppercase tracking-wider text-slate-600">
              <th className="px-2 py-1.5">#</th>
              <th className="px-2 py-1.5">Supplier</th>
              <th className="px-2 py-1.5 text-right">Total</th>
              <th className="px-2 py-1.5 text-right">Share</th>
              <th className="px-2 py-1.5 text-center">Txns</th>
              <th className="px-2 py-1.5 text-center">MoM</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/30">
            {displayed.map((s, i) => {
              const pct = (s.total / grandTotal) * 100
              return (
                <tr key={s.name} className="hover:bg-slate-800/30">
                  <td className="px-2 py-1.5 text-slate-600">{i + 1}</td>
                  <td className="max-w-[120px] truncate px-2 py-1.5 font-medium text-slate-300">
                    {s.name}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-slate-200">
                    ฿{Math.round(s.total).toLocaleString()}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <div className="h-1 w-12 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full bg-emerald-500/60"
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <span className="w-8 text-right text-[10px] text-slate-500">
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-center text-slate-400">{s.count}</td>
                  <td className="px-2 py-1.5 text-center">
                    <TrendBadge value={s.trend} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {stats.length > limit && (
        <div className="border-t border-slate-800/40 px-4 py-2 text-center">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-[10px] text-indigo-400 hover:text-indigo-300"
          >
            {showAll ? 'Show less' : `Show all ${stats.length} suppliers`}
          </button>
        </div>
      )}
    </div>
  )
}

function TrendBadge({ value }: { value: number }) {
  if (Math.abs(value) < 1) {
    return <Minus className="mx-auto h-3 w-3 text-slate-600" />
  }
  if (value > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] text-rose-400">
        <TrendingUp className="h-3 w-3" />
        {value.toFixed(0)}%
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] text-emerald-400">
      <TrendingDown className="h-3 w-3" />
      {Math.abs(value).toFixed(0)}%
    </span>
  )
}
