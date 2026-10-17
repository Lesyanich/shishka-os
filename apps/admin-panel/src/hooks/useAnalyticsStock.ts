import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { PeriodRange } from '../lib/analytics'
import type { FoodCostWeekRow } from '../lib/analyticsPurchases'
import type {
  BomCoverageWeekRow,
  CountDayRow,
  InventoryValueRow,
  ReplenishmentRow,
  StockStatusRow,
  StockVarianceRow,
  WasteWeekRow,
} from '../lib/analyticsStock'

/* ═══════════════════════════════════════════════════════════════════
   useAnalyticsStock — reads the stock views for the Stock control tab
   (spec §5 Tab 3).

   Read-only, no realtime and no writes of any kind: counts and waste
   are entered through their own screens (StocktakeReviewPage,
   WasteTracker), and this tab only reports.

   Sources (migration 463): v_analytics_stock_variance ·
   _count_days · _inventory_value · _waste_weekly ·
   _bom_coverage_weekly · _food_cost_weekly. Plus the two existing
   views the spec says to reuse as-is: v_station_replenishment and
   v_stock_status.
   ═══════════════════════════════════════════════════════════════════ */

export interface UseAnalyticsStockResult {
  variance: StockVarianceRow[]
  countDays: CountDayRow[]
  inventory: InventoryValueRow[]
  waste: WasteWeekRow[]
  bomCoverage: BomCoverageWeekRow[]
  foodCost: FoodCostWeekRow[]
  replenishment: ReplenishmentRow[]
  stockStatus: StockStatusRow[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Null must survive as null: a missing percentage is not 0 %. */
function nullableNum(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function useAnalyticsStock(range: PeriodRange): UseAnalyticsStockResult {
  const [variance, setVariance] = useState<StockVarianceRow[]>([])
  const [countDays, setCountDays] = useState<CountDayRow[]>([])
  const [inventory, setInventory] = useState<InventoryValueRow[]>([])
  const [waste, setWaste] = useState<WasteWeekRow[]>([])
  const [bomCoverage, setBomCoverage] = useState<BomCoverageWeekRow[]>([])
  const [foodCost, setFoodCost] = useState<FoodCostWeekRow[]>([])
  const [replenishment, setReplenishment] = useState<ReplenishmentRow[]>([])
  const [stockStatus, setStockStatus] = useState<StockStatusRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const [
      varianceRes,
      countRes,
      invRes,
      wasteRes,
      bomRes,
      foodRes,
      repRes,
      statusRes,
    ] = await Promise.all([
      // Not filtered by the period: the interval IS the period for variance,
      // and there are so few intervals that taking them all is cheaper than
      // reasoning about which ones a day range covers.
      supabase
        .from('v_analytics_stock_variance')
        .select(
          'opening_day, closing_day, days_in_interval, nomenclature_id, product_code, item_name, base_unit, count_class, is_complete, opening_qty, purchases_qty, purchases_thb, usage_qty, waste_qty, expected_closing_qty, closing_qty, variance_qty, variance_thb, variance_pct_of_usage',
        )
        .order('closing_day', { ascending: true }),
      supabase
        .from('v_analytics_count_days')
        .select(
          'count_day, nomenclature_id, product_code, item_name, base_unit, count_class, counted_qty, locations_counted, locations_expected, stations_counted, is_complete, counted_thb',
        ),
      supabase
        .from('v_analytics_inventory_value')
        .select(
          'nomenclature_id, product_code, item_name, base_unit, location_id, location_name, counted_qty, cost_per_unit, value_thb, counted_on, days_since_count, count_class, is_canonical',
        ),
      supabase
        .from('v_analytics_waste_weekly')
        .select(
          'week, reason, entries, items, qty, thb, thb_liability_cafe, thb_liability_employee, thb_liability_supplier',
        )
        .gte('week', range.weekStart)
        .lte('week', range.weekEnd),
      supabase
        .from('v_analytics_bom_coverage_weekly')
        .select('week, deducted_units_pct')
        .gte('week', range.weekStart)
        .lte('week', range.weekEnd),
      supabase
        .from('v_analytics_food_cost_weekly')
        .select(
          'week, revenue, receipts, cogs_theoretical, purchases_thb_canonical, purchases_thb_all, inventory_close_thb, inventory_open_thb, inventory_delta_thb, cogs_actual, cogs_actual_basis, fc_theoretical_pct, fc_actual_pct, gap_thb',
        )
        .gte('week', range.weekStart)
        .lte('week', range.weekEnd),
      // Reused as-is per spec §5 — live state, not period-scoped.
      supabase
        .from('v_station_replenishment')
        .select(
          'nomenclature_id, product_code, name, base_unit, location_name, on_hand, min_stock, par_stock, suggested_qty, stock_status, replenish_action',
        ),
      supabase
        .from('v_stock_status')
        .select('nomenclature_id, product_code, name, storage_location, next_expiry, expiring_soon, expired'),
    ])

    const failure =
      varianceRes.error ??
      countRes.error ??
      invRes.error ??
      wasteRes.error ??
      bomRes.error ??
      foodRes.error ??
      repRes.error ??
      statusRes.error
    if (failure) {
      console.error('[useAnalyticsStock] fetch error', failure)
      setError(failure.message)
      setIsLoading(false)
      return
    }

    setVariance(
      (varianceRes.data ?? []).map((r) => ({
        opening_day: r.opening_day as string,
        closing_day: r.closing_day as string,
        days_in_interval: num(r.days_in_interval),
        nomenclature_id: r.nomenclature_id as string,
        product_code: (r.product_code as string | null) ?? '',
        item_name: (r.item_name as string | null) ?? 'Unnamed item',
        base_unit: (r.base_unit as string | null) ?? '',
        count_class: (r.count_class as string | null) ?? null,
        is_complete: r.is_complete === true,
        opening_qty: num(r.opening_qty),
        purchases_qty: num(r.purchases_qty),
        purchases_thb: num(r.purchases_thb),
        usage_qty: num(r.usage_qty),
        waste_qty: num(r.waste_qty),
        expected_closing_qty: num(r.expected_closing_qty),
        closing_qty: num(r.closing_qty),
        variance_qty: num(r.variance_qty),
        variance_thb: num(r.variance_thb),
        variance_pct_of_usage: nullableNum(r.variance_pct_of_usage),
      })),
    )

    setCountDays(
      (countRes.data ?? []).map((r) => ({
        count_day: r.count_day as string,
        nomenclature_id: r.nomenclature_id as string,
        product_code: (r.product_code as string | null) ?? '',
        item_name: (r.item_name as string | null) ?? 'Unnamed item',
        base_unit: (r.base_unit as string | null) ?? '',
        count_class: (r.count_class as string | null) ?? null,
        counted_qty: num(r.counted_qty),
        locations_counted: num(r.locations_counted),
        locations_expected: num(r.locations_expected),
        stations_counted: num(r.stations_counted),
        is_complete: r.is_complete === true,
        counted_thb: num(r.counted_thb),
      })),
    )

    setInventory(
      (invRes.data ?? []).map((r) => ({
        nomenclature_id: r.nomenclature_id as string,
        product_code: (r.product_code as string | null) ?? '',
        item_name: (r.item_name as string | null) ?? 'Unnamed item',
        base_unit: (r.base_unit as string | null) ?? '',
        location_id: (r.location_id as string | null) ?? null,
        location_name: (r.location_name as string | null) ?? null,
        counted_qty: num(r.counted_qty),
        // Null matters here: it is the difference between "no cost on file"
        // and "costs nothing", and the tile reports on it.
        cost_per_unit: nullableNum(r.cost_per_unit),
        value_thb: num(r.value_thb),
        counted_on: (r.counted_on as string | null) ?? null,
        days_since_count: nullableNum(r.days_since_count),
        count_class: (r.count_class as string | null) ?? null,
        is_canonical: r.is_canonical === true,
      })),
    )

    setWaste(
      (wasteRes.data ?? []).map((r) => ({
        week: r.week as string,
        reason: (r.reason as string | null) ?? 'unknown',
        entries: num(r.entries),
        items: num(r.items),
        qty: num(r.qty),
        thb: num(r.thb),
        thb_liability_cafe: num(r.thb_liability_cafe),
        thb_liability_employee: num(r.thb_liability_employee),
        thb_liability_supplier: num(r.thb_liability_supplier),
      })),
    )

    setBomCoverage(
      (bomRes.data ?? []).map((r) => ({
        week: r.week as string,
        deducted_units_pct: nullableNum(r.deducted_units_pct),
      })),
    )

    setFoodCost(
      (foodRes.data ?? []).map((r) => ({
        week: r.week as string,
        revenue: num(r.revenue),
        receipts: num(r.receipts),
        cogs_theoretical: num(r.cogs_theoretical),
        purchases_thb_canonical: num(r.purchases_thb_canonical),
        purchases_thb_all: num(r.purchases_thb_all),
        inventory_close_thb: nullableNum(r.inventory_close_thb),
        inventory_open_thb: nullableNum(r.inventory_open_thb),
        inventory_delta_thb: nullableNum(r.inventory_delta_thb),
        cogs_actual: nullableNum(r.cogs_actual),
        cogs_actual_basis: (r.cogs_actual_basis as string | null) ?? null,
        fc_theoretical_pct: nullableNum(r.fc_theoretical_pct),
        fc_actual_pct: nullableNum(r.fc_actual_pct),
        gap_thb: nullableNum(r.gap_thb),
      })),
    )

    setReplenishment(
      (repRes.data ?? []).map((r) => ({
        nomenclature_id: r.nomenclature_id as string,
        product_code: (r.product_code as string | null) ?? '',
        name: (r.name as string | null) ?? 'Unnamed item',
        base_unit: (r.base_unit as string | null) ?? '',
        location_name: (r.location_name as string | null) ?? null,
        on_hand: num(r.on_hand),
        min_stock: nullableNum(r.min_stock),
        par_stock: nullableNum(r.par_stock),
        suggested_qty: nullableNum(r.suggested_qty),
        stock_status: (r.stock_status as string | null) ?? null,
        replenish_action: (r.replenish_action as string | null) ?? null,
      })),
    )

    setStockStatus(
      (statusRes.data ?? []).map((r) => ({
        nomenclature_id: r.nomenclature_id as string,
        product_code: (r.product_code as string | null) ?? '',
        name: (r.name as string | null) ?? 'Unnamed item',
        storage_location: (r.storage_location as string | null) ?? null,
        next_expiry: (r.next_expiry as string | null) ?? null,
        expiring_soon: num(r.expiring_soon),
        expired: num(r.expired),
      })),
    )

    setIsLoading(false)
  }, [range.weekStart, range.weekEnd])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return {
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
    refetch: fetchData,
  }
}
