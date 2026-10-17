import { useMemo } from 'react'
import { useAnalyticsPeriod } from '../../contexts/AnalyticsPeriodContext'
import { useAnalyticsSalesPulse } from '../../hooks/useAnalyticsSalesPulse'
import { KpiCard } from '../../components/finance/KpiCard'
import { formatTHBFull } from '../../components/finance/helpers'
import { CoverageStrip } from '../../components/analytics/CoverageStrip'
import { WeeklyRevenueChart } from '../../components/analytics/WeeklyRevenueChart'
import { TopDishesChart, makeCategoryColor } from '../../components/analytics/TopDishesChart'
import { CategoryMixDonut } from '../../components/analytics/CategoryMixDonut'
import { HourHeatmap } from '../../components/analytics/HourHeatmap'
import {
  aggregateDishes,
  categoryMix,
  heatGrid,
  kpiStrip,
  sumSales,
  weeklySeries,
} from '../../lib/analytics'

/* ═══════════════════════════════════════════════════════════
   SalesPulseTab — /analytics/sales (spec §5 Tab 1).

   Reads only v_analytics_sales_daily, v_analytics_item_sales_daily
   and v_analytics_hourly_heat. All arithmetic lives in
   lib/analytics.ts so it is unit-tested; this file only composes.
   ═══════════════════════════════════════════════════════════ */

export function SalesPulseTab() {
  const { range } = useAnalyticsPeriod()
  const { sales, items, heat, isLoading, error, refetch } = useAnalyticsSalesPulse(range)

  const totals = useMemo(() => sumSales(sales, range.start, range.end), [sales, range])
  const kpis = useMemo(() => kpiStrip(sales, range), [sales, range])
  const weekly = useMemo(() => weeklySeries(sales, range), [sales, range])
  const dishes = useMemo(() => aggregateDishes(items, range), [items, range])
  const slices = useMemo(() => categoryMix(dishes), [dishes])
  const grid = useMemo(() => heatGrid(heat, range), [heat, range])

  // One colour map for both the top-10 and the donut, keyed on revenue rank.
  const categoryColor = useMemo(() => makeCategoryColor(slices.map((s) => s.name)), [slices])

  return (
    <div className="space-y-5">
      <CoverageStrip range={range} totals={totals} isLoading={isLoading} onRefresh={refetch} />

      {error && (
        <div className="rounded-xl border border-brick-bright/30 bg-brick-bright/10 px-4 py-3 text-xs text-brick-bright">
          Could not load the analytics views: {error}
        </div>
      )}

      {/* KPI strip — 7d / 28d are fixed rolling windows; receipts and avg check
          follow the selected period. Revenue growth reads green, not red. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Revenue · 7d"
          value={`฿${formatTHBFull(kpis.revenue7d)}`}
          delta={kpis.revenue7dDelta}
          goodDirection="up"
          isLoading={isLoading}
        />
        <KpiCard
          label="Revenue · 28d"
          value={`฿${formatTHBFull(kpis.revenue28d)}`}
          delta={kpis.revenue28dDelta}
          goodDirection="up"
          isLoading={isLoading}
        />
        <KpiCard
          label={`Receipts · ${range.label}`}
          value={String(kpis.receipts)}
          delta={kpis.receiptsDelta}
          goodDirection="up"
          isLoading={isLoading}
        />
        <KpiCard
          label={`Avg check · ${range.label}`}
          value={`฿${formatTHBFull(kpis.avgCheck)}`}
          delta={kpis.avgCheckDelta}
          goodDirection="up"
          isLoading={isLoading}
        />
      </div>

      <WeeklyRevenueChart data={weekly} range={range} isLoading={isLoading} error={error} />

      <div className="grid gap-5 lg:grid-cols-2">
        <TopDishesChart dishes={dishes} categoryColor={categoryColor} isLoading={isLoading} />
        <CategoryMixDonut slices={slices} categoryColor={categoryColor} isLoading={isLoading} />
      </div>

      <HourHeatmap grid={grid} range={range} isLoading={isLoading} />
    </div>
  )
}

export default SalesPulseTab
