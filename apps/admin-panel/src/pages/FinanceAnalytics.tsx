import { lazy, Suspense } from 'react'
import { useFinance } from '../contexts/FinanceContext'
import { formatTHBFull } from '../components/finance/helpers'
import { KpiCard } from '../components/finance/KpiCard'
import { CategoryBreakdown } from '../components/finance/CategoryBreakdown'
import { TopSuppliers } from '../components/finance/TopSuppliers'

const MonthlyChart = lazy(() =>
  import('../components/finance/MonthlyChart').then((m) => ({ default: m.MonthlyChart })),
)

/* ═══════════════════════════════════════════════════════════
   FinanceAnalytics — Charts & KPI dashboard
   Phase 1: MonthlyChart + KPI cards (existing components)
   Phase 2: CategoryBreakdown donut + TopSuppliers table
   ═══════════════════════════════════════════════════════════ */

export function FinanceAnalytics() {
  const { rows, monthlySummaries, grandTotal, isLoading, error } = useFinance()

  // KPI calculations
  const now = new Date()
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthTotal = rows
    .filter((r) => r.transaction_date.startsWith(currentMonthKey))
    .reduce((s, r) => s + r.amount_thb, 0)
  const prevMonthKey =
    now.getMonth() === 0
      ? `${now.getFullYear() - 1}-12`
      : `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`
  const prevMonthTotal = rows
    .filter((r) => r.transaction_date.startsWith(prevMonthKey))
    .reduce((s, r) => s + r.amount_thb, 0)
  const monthDelta =
    prevMonthTotal > 0 ? ((monthTotal - prevMonthTotal) / prevMonthTotal) * 100 : 0

  // Year-to-date
  const yearKey = String(now.getFullYear())
  const ytdTotal = rows
    .filter((r) => r.transaction_date.startsWith(yearKey))
    .reduce((s, r) => s + r.amount_thb, 0)

  // Monthly average (all time)
  const monthCount = monthlySummaries.length || 1
  const monthlyAvg = grandTotal / monthCount

  return (
    <div className="space-y-6">
      {/* KPI strip — 4 cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="This Month"
          value={`฿${formatTHBFull(monthTotal)}`}
          delta={monthDelta}
          isLoading={isLoading}
        />
        <KpiCard
          label="Year to Date"
          value={`฿${formatTHBFull(ytdTotal)}`}
          isLoading={isLoading}
        />
        <KpiCard
          label="Monthly Average"
          value={`฿${formatTHBFull(monthlyAvg)}`}
          isLoading={isLoading}
        />
        <KpiCard
          label="Transactions"
          value={String(rows.length)}
          isLoading={isLoading}
        />
      </div>

      {/* Monthly trend chart — larger */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-300">Monthly Expenses</h2>
        <Suspense fallback={<div className="h-80 animate-pulse rounded-lg bg-slate-800/50" />}>
          <MonthlyChart summaries={monthlySummaries} isLoading={isLoading} error={error} />
        </Suspense>
      </div>

      {/* Category Breakdown + Top Suppliers */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="min-h-[280px] rounded-xl border border-slate-800 bg-slate-900/50">
          <CategoryBreakdown rows={rows} isLoading={isLoading} />
        </div>
        <div className="min-h-[280px] rounded-xl border border-slate-800 bg-slate-900/50">
          <TopSuppliers rows={rows} isLoading={isLoading} />
        </div>
      </div>
    </div>
  )
}

export default FinanceAnalytics
