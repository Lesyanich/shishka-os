import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { PeriodRange } from '../lib/analytics'
import {
  previousWeekWindow,
  type AbcItemRow,
  type CoverageWeekRow,
  type FoodCostWeekRow,
  type PriceWatchRow,
  type PurchaseWeekRow,
} from '../lib/analyticsPurchases'

/* ═══════════════════════════════════════════════════════════════════
   useAnalyticsPurchases — reads the five purchase views for the
   Purchases tab (spec §5 Tab 2), plus one approved extra source.

   Read-only, no realtime subscription: purchases arrive through
   receipt approval, not through live writes from this tab, so a
   manual refresh is honest and keeps us clear of
   RULE-REALTIME-LIST-HOOK.

   Sources (migration 463):
     v_analytics_purchases_weekly · v_analytics_purchase_coverage_weekly
     v_analytics_price_watch · v_analytics_abc_items
     v_analytics_food_cost_weekly
   Plus `bom_structures.ingredient_id` — a CEO-approved sixth source
   (2026-10-17) used ONLY to answer "does anything consume this item",
   for the no-BOM badge. Nothing else reads it.
   ═══════════════════════════════════════════════════════════════════ */

export interface UseAnalyticsPurchasesResult {
  purchases: PurchaseWeekRow[]
  coverage: CoverageWeekRow[]
  priceWatch: PriceWatchRow[]
  abcItems: AbcItemRow[]
  foodCost: FoodCostWeekRow[]
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

export function useAnalyticsPurchases(range: PeriodRange): UseAnalyticsPurchasesResult {
  const [purchases, setPurchases] = useState<PurchaseWeekRow[]>([])
  const [coverage, setCoverage] = useState<CoverageWeekRow[]>([])
  const [priceWatch, setPriceWatch] = useState<PriceWatchRow[]>([])
  const [abcItems, setAbcItems] = useState<AbcItemRow[]>([])
  const [foodCost, setFoodCost] = useState<FoodCostWeekRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Supplier deltas compare whole ISO weeks, so the fetch has to reach back
  // further than the period itself — see previousWeekWindow().
  const prev = previousWeekWindow(range)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const [purchasesRes, coverageRes, priceRes, abcRes, foodRes, bomRes] = await Promise.all([
      supabase
        .from('v_analytics_purchases_weekly')
        .select(
          'week, nomenclature_id, product_code, item_name, base_unit, supplier_id, supplier_name, lines, qty_base, thb, last_price_per_unit, last_unit_price_base, last_invoice_date, cf_known, is_canonical',
        )
        .gte('week', prev.start)
        .lte('week', range.end),
      supabase
        .from('v_analytics_purchase_coverage_weekly')
        .select(
          'week, lines_total, canonical_lines, stub_lines, thb_total, thb_canonical, canonical_pct, canonical_lines_pct, unmatched_open',
        )
        .gte('week', prev.start)
        .lte('week', range.end),
      // Rolling 8 weeks inside the view; no week column to filter on.
      supabase
        .from('v_analytics_price_watch')
        .select(
          'nomenclature_id, product_code, item_name, base_unit, supplier_id, supplier_name, last_unit_price, median_unit_price_8w, last_invoice_date, weeks_observed, cf_known, count_class, delta_pct, is_spike',
        ),
      supabase
        .from('v_analytics_abc_items')
        .select(
          'nomenclature_id, product_code, name, base_unit, type, is_canonical, purchase_thb_8w, lines_8w, last_invoice_date, cum_share, count_class',
        )
        .gt('purchase_thb_8w', 0)
        .order('purchase_thb_8w', { ascending: false })
        .limit(60),
      supabase
        .from('v_analytics_food_cost_weekly')
        .select(
          'week, revenue, receipts, cogs_theoretical, purchases_thb_canonical, purchases_thb_all, inventory_close_thb, inventory_open_thb, inventory_delta_thb, cogs_actual, cogs_actual_basis, fc_theoretical_pct, fc_actual_pct, gap_thb',
        )
        .gte('week', prev.start)
        .lte('week', range.end),
      supabase.from('bom_structures').select('ingredient_id'),
    ])

    const failure =
      purchasesRes.error ??
      coverageRes.error ??
      priceRes.error ??
      abcRes.error ??
      foodRes.error ??
      bomRes.error
    if (failure) {
      console.error('[useAnalyticsPurchases] fetch error', failure)
      setError(failure.message)
      setIsLoading(false)
      return
    }

    setPurchases(
      (purchasesRes.data ?? []).map((r) => ({
        week: r.week as string,
        nomenclature_id: r.nomenclature_id as string,
        product_code: (r.product_code as string | null) ?? '',
        item_name: (r.item_name as string | null) ?? 'Unnamed item',
        base_unit: (r.base_unit as string | null) ?? '',
        supplier_id: (r.supplier_id as string | null) ?? null,
        supplier_name: (r.supplier_name as string | null) ?? null,
        lines: num(r.lines),
        qty_base: num(r.qty_base),
        thb: num(r.thb),
        last_price_per_unit: nullableNum(r.last_price_per_unit),
        last_unit_price_base: nullableNum(r.last_unit_price_base),
        last_invoice_date: (r.last_invoice_date as string | null) ?? null,
        cf_known: r.cf_known === true,
        is_canonical: r.is_canonical === true,
      })),
    )

    setCoverage(
      (coverageRes.data ?? []).map((r) => ({
        week: r.week as string,
        lines_total: num(r.lines_total),
        canonical_lines: num(r.canonical_lines),
        stub_lines: num(r.stub_lines),
        thb_total: num(r.thb_total),
        thb_canonical: num(r.thb_canonical),
        canonical_pct: num(r.canonical_pct),
        canonical_lines_pct: num(r.canonical_lines_pct),
        unmatched_open: num(r.unmatched_open),
      })),
    )

    setPriceWatch(
      (priceRes.data ?? []).map((r) => ({
        nomenclature_id: r.nomenclature_id as string,
        product_code: (r.product_code as string | null) ?? '',
        item_name: (r.item_name as string | null) ?? 'Unnamed item',
        base_unit: (r.base_unit as string | null) ?? '',
        supplier_id: (r.supplier_id as string | null) ?? null,
        supplier_name: (r.supplier_name as string | null) ?? null,
        last_unit_price: nullableNum(r.last_unit_price),
        median_unit_price_8w: nullableNum(r.median_unit_price_8w),
        last_invoice_date: (r.last_invoice_date as string | null) ?? null,
        weeks_observed: num(r.weeks_observed),
        cf_known: r.cf_known === true,
        count_class: (r.count_class as string | null) ?? null,
        delta_pct: nullableNum(r.delta_pct),
        is_spike: r.is_spike === true,
      })),
    )

    // One set lookup answers the no-BOM badge for every item at once.
    const consumed = new Set((bomRes.data ?? []).map((r) => r.ingredient_id as string))

    setAbcItems(
      (abcRes.data ?? []).map((r) => ({
        nomenclature_id: r.nomenclature_id as string,
        product_code: (r.product_code as string | null) ?? '',
        name: (r.name as string | null) ?? 'Unnamed item',
        base_unit: (r.base_unit as string | null) ?? '',
        type: (r.type as string | null) ?? null,
        is_canonical: r.is_canonical === true,
        purchase_thb_8w: num(r.purchase_thb_8w),
        lines_8w: num(r.lines_8w),
        last_invoice_date: (r.last_invoice_date as string | null) ?? null,
        cum_share: nullableNum(r.cum_share),
        count_class: (r.count_class as string | null) ?? null,
        has_bom: consumed.has(r.nomenclature_id as string),
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

    setIsLoading(false)
  }, [prev.start, range.end])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { purchases, coverage, priceWatch, abcItems, foodCost, isLoading, error, refetch: fetchData }
}
