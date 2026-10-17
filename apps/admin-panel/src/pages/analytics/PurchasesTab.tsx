import { useMemo } from 'react'
import { useAnalyticsPeriod } from '../../contexts/AnalyticsPeriodContext'
import { useAnalyticsPurchases } from '../../hooks/useAnalyticsPurchases'
import { KpiCard } from '../../components/finance/KpiCard'
import { formatTHBFull } from '../../components/finance/helpers'
import { PurchaseCoverageStrip } from '../../components/analytics/PurchaseCoverageStrip'
import { WeeklySpendChart } from '../../components/analytics/WeeklySpendChart'
import { PurchaseRatioChart } from '../../components/analytics/PurchaseRatioChart'
import { SupplierTable } from '../../components/analytics/SupplierTable'
import { PriceWatchTable } from '../../components/analytics/PriceWatchTable'
import { TopSpendItems } from '../../components/analytics/TopSpendItems'
import { pctDelta } from '../../lib/analytics'
import {
  coverageTotals,
  previousWeekWindow,
  priceWatchView,
  ratioSeries,
  supplierTable,
  topSpendItems,
  weeklySpend,
} from '../../lib/analyticsPurchases'

/* ═══════════════════════════════════════════════════════════════════
   PurchasesTab — /analytics/purchases (spec §5 Tab 2, S3).

   Reads v_analytics_purchases_weekly, _purchase_coverage_weekly,
   _price_watch, _abc_items and _food_cost_weekly, plus the
   bom_structures ingredient set for the no-BOM badge (CEO-approved,
   2026-10-17). All arithmetic lives in lib/analyticsPurchases.ts so
   it is unit-tested; this file only composes.

   Price watch and top-20 carry the views' own rolling 8-week window
   and therefore do not follow the period selector — each says so.
   ═══════════════════════════════════════════════════════════════════ */

export function PurchasesTab() {
  const { range } = useAnalyticsPeriod()
  const { purchases, coverage, priceWatch, abcItems, foodCost, isLoading, error, refetch } =
    useAnalyticsPurchases(range)

  const totals = useMemo(() => coverageTotals(coverage, range), [coverage, range])
  const suppliers = useMemo(() => supplierTable(purchases, range), [purchases, range])
  const spend = useMemo(() => weeklySpend(purchases, range), [purchases, range])
  const ratio = useMemo(() => ratioSeries(foodCost, range), [foodCost, range])
  const watch = useMemo(() => priceWatchView(priceWatch), [priceWatch])
  const topItems = useMemo(() => topSpendItems(abcItems), [abcItems])

  // Spend vs the previous whole-week window, for the KPI delta.
  const prevSpend = useMemo(() => {
    const prev = previousWeekWindow(range)
    return purchases
      .filter((r) => r.week >= prev.start && r.week <= prev.end)
      .reduce((s, r) => s + r.thb, 0)
  }, [purchases, range])

  const latestMean = [...ratio].reverse().find((p) => p.rollingPct !== null)?.rollingPct ?? null

  return (
    <div className="space-y-5">
      <PurchaseCoverageStrip
        range={range}
        totals={totals}
        isLoading={isLoading}
        onRefresh={refetch}
      />

      {error && (
        <div className="rounded-xl border border-brick-bright/30 bg-brick-bright/10 px-4 py-3 text-xs text-brick-bright">
          Could not load the purchase views: {error}
        </div>
      )}

      {/* Spend rising is not automatically bad news for purchasing — but it is
          what the owner watches, so it keeps the Finance default polarity. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={`Purchased · ${range.label}`}
          value={`฿${formatTHBFull(totals.thbTotal)}`}
          delta={pctDelta(totals.thbTotal, prevSpend)}
          isLoading={isLoading}
        />
        <KpiCard
          label="On canonical items"
          value={`${totals.canonicalPct.toFixed(1)}%`}
          goodDirection="up"
          isLoading={isLoading}
        />
        <KpiCard
          label="Purchases ÷ revenue · 4w mean"
          value={latestMean === null ? '—' : `${latestMean.toFixed(1)}%`}
          isLoading={isLoading}
        />
        <KpiCard label="Suppliers" value={String(suppliers.length)} isLoading={isLoading} />
      </div>

      <WeeklySpendChart spend={spend} range={range} isLoading={isLoading} error={error} />
      <PurchaseRatioChart data={ratio} range={range} isLoading={isLoading} error={error} />

      <div className="grid gap-5 lg:grid-cols-2">
        <SupplierTable rows={suppliers} isLoading={isLoading} />
        <TopSpendItems view={topItems} isLoading={isLoading} />
      </div>

      <PriceWatchTable view={watch} isLoading={isLoading} />
    </div>
  )
}

export default PurchasesTab
