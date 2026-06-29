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
          <div key={i} className="h-8 animate-pulse rounded bg-[var(--s-2)]" />
        ))}
      </div>
    )
  }

  if (stats.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-cream/45">
        No supplier data
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <h3 className="text-sm font-semibold text-cream/80">Top Suppliers</h3>
        <span className="text-[10px] text-cream/45">{stats.length} suppliers</span>
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        <table className="w-full text-left text-[11px]">
          <thead>
            <tr className="text-[9px] uppercase tracking-wider text-cream/30">
              <th className="px-2 py-1.5">#</th>
              <th className="px-2 py-1.5">Supplier</th>
              <th className="px-2 py-1.5 text-right">Total</th>
              <th className="px-2 py-1.5 text-right">Share</th>
              <th className="px-2 py-1.5 text-center">Txns</th>
              <th className="px-2 py-1.5 text-center">MoM</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {displayed.map((s, i) => {
              const pct = (s.total / grandTotal) * 100
              return (
                <tr key={s.name} className="hover:bg-[var(--s-2)]">
                  <td className="px-2 py-1.5 text-cream/30">{i + 1}</td>
                  <td className="max-w-[120px] truncate px-2 py-1.5 font-medium text-cream/80">
                    {s.name}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-cream">
                    ฿{Math.round(s.total).toLocaleString()}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <div className="h-1 w-12 overflow-hidden rounded-full bg-[var(--s-2)]">
                        <div
                          className="h-full rounded-full bg-forest-soft/70"
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <span className="w-8 text-right text-[10px] text-cream/45">
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-center text-cream/60">{s.count}</td>
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
        <div className="border-t border-[var(--line)] px-4 py-2 text-center">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-[10px] text-forest-soft hover:text-mint-200"
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
    return <Minus className="mx-auto h-3 w-3 text-cream/30" />
  }
  if (value > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] text-brick-bright">
        <TrendingUp className="h-3 w-3" />
        {value.toFixed(0)}%
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] text-mint-200">
      <TrendingDown className="h-3 w-3" />
      {Math.abs(value).toFixed(0)}%
    </span>
  )
}
