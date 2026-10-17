import { useMemo } from 'react'
import { useAnalyticsPeriod } from '../../contexts/AnalyticsPeriodContext'
import { useAnalyticsStock } from '../../hooks/useAnalyticsStock'
import { KpiCard } from '../../components/finance/KpiCard'
import { formatTHBFull } from '../../components/finance/helpers'
import { StockCoverageStrip } from '../../components/analytics/StockCoverageStrip'
import { VarianceTable } from '../../components/analytics/VarianceTable'
import { FoodCostGapChart } from '../../components/analytics/FoodCostGapChart'
import { InventoryValueTile } from '../../components/analytics/InventoryValueTile'
import { WasteByReasonChart } from '../../components/analytics/WasteByReasonChart'
import { ReorderExpiringPanel } from '../../components/analytics/ReorderExpiringPanel'
import {
  countCoverage,
  expiringRows,
  foodCostGapSeries,
  inventoryValueSummary,
  reorderRows,
  varianceView,
  wasteSummary,
} from '../../lib/analyticsStock'

/* ═══════════════════════════════════════════════════════════════════
   StockControlTab — /analytics/stock (spec §5 Tab 3, S4).

   The hero variance table is empty on prod and says why: a variance
   interval needs two count days and there is one. That is a floor
   process, not a code gap, and the tab is built so the first real
   interval fills it with no further work.

   All arithmetic lives in lib/analyticsStock.ts and
   lib/analyticsThresholds.ts so it is unit-tested; this file only
   composes.
   ═══════════════════════════════════════════════════════════════════ */

export function StockControlTab() {
  const { range } = useAnalyticsPeriod()
  const {
    variance,
    countDays,
    inventory,
    waste,
    bomCoverage,
    foodCost,
    replenishment,
    stockStatus,
    isLoading,
    error,
    refetch,
  } = useAnalyticsStock(range)

  const coverage = useMemo(() => countCoverage(countDays), [countDays])
  const varianceRows = useMemo(() => varianceView(variance), [variance])
  const inventorySummary = useMemo(() => inventoryValueSummary(inventory), [inventory])
  const wasteTotals = useMemo(() => wasteSummary(waste, range), [waste, range])
  const gap = useMemo(() => foodCostGapSeries(foodCost, range), [foodCost, range])
  const reorder = useMemo(() => reorderRows(replenishment), [replenishment])
  const expiring = useMemo(() => expiringRows(stockStatus), [stockStatus])

  const latestBomPct = useMemo(() => {
    const sorted = [...bomCoverage].sort((a, b) => a.week.localeCompare(b.week))
    return sorted.at(-1)?.deducted_units_pct ?? null
  }, [bomCoverage])

  const latestGap = [...gap].reverse().find((p) => p.gapThb !== null)

  return (
    <div className="space-y-5">
      <StockCoverageStrip
        coverage={coverage}
        daysSinceCount={inventorySummary.daysSinceCount}
        wasteEntries={wasteTotals.entries}
        bomCoveragePct={latestBomPct}
        isLoading={isLoading}
        onRefresh={refetch}
      />

      {error && (
        <div className="rounded-xl border border-brick-bright/30 bg-brick-bright/10 px-4 py-3 text-xs text-brick-bright">
          Could not load the stock views: {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Inventory at last count"
          value={`฿${formatTHBFull(inventorySummary.totalThb)}`}
          isLoading={isLoading}
        />
        <KpiCard
          label="Count age"
          value={
            inventorySummary.daysSinceCount === null
              ? '—'
              : `${inventorySummary.daysSinceCount} days`
          }
          isLoading={isLoading}
        />
        <KpiCard
          label="Waste logged"
          value={`฿${formatTHBFull(wasteTotals.totalThb)}`}
          isLoading={isLoading}
        />
        <KpiCard
          label="Unaccounted spend · latest week"
          value={latestGap?.gapThb === undefined || latestGap?.gapThb === null
            ? '—'
            : `฿${formatTHBFull(latestGap.gapThb)}`}
          isLoading={isLoading}
        />
      </div>

      <VarianceTable
        rows={varianceRows.rows}
        droppedIncomplete={varianceRows.droppedIncomplete}
        interval={varianceRows.interval}
        coverage={coverage}
        isLoading={isLoading}
      />

      <FoodCostGapChart data={gap} range={range} isLoading={isLoading} error={error} />

      <div className="grid gap-5 lg:grid-cols-2">
        <InventoryValueTile summary={inventorySummary} isLoading={isLoading} />
        <WasteByReasonChart summary={wasteTotals} isLoading={isLoading} />
      </div>

      <ReorderExpiringPanel reorder={reorder} expiring={expiring} isLoading={isLoading} />
    </div>
  )
}

export default StockControlTab
