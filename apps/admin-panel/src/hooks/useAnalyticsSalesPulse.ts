import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { HourlyHeatRow, ItemSalesRow, PeriodRange, SalesDailyRow } from '../lib/analytics'

/* ═══════════════════════════════════════════════════════════════════
   useAnalyticsSalesPulse — reads the three S1 sales views.

   Read-only, no realtime subscription: Loyverse orders arrive through
   the cron sync, not through live writes from this app, so there is
   nothing to echo back. A manual refresh is the honest affordance and
   it keeps us clear of RULE-REALTIME-LIST-HOOK entirely.

   Sources (migration 463, + 473 for the heat view's `week` column):
     v_analytics_sales_daily · v_analytics_item_sales_daily
     v_analytics_hourly_heat
   Nothing else — spec §5 Tab 1.
   ═══════════════════════════════════════════════════════════════════ */

export interface UseAnalyticsSalesPulseResult {
  sales: SalesDailyRow[]
  items: ItemSalesRow[]
  heat: HourlyHeatRow[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

/** PostgREST hands numeric back as a JSON number, but a null column would
 *  poison every sum downstream — coerce once, at the boundary. */
function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export function useAnalyticsSalesPulse(range: PeriodRange): UseAnalyticsSalesPulseResult {
  const [sales, setSales] = useState<SalesDailyRow[]>([])
  const [items, setItems] = useState<ItemSalesRow[]>([])
  const [heat, setHeat] = useState<HourlyHeatRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // The 7d / 28d KPIs compare against the window before them, so the daily
  // fetch has to reach back further than the selected period itself.
  const salesFrom = range.prevStart < range.start ? range.prevStart : range.start

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const [salesRes, itemsRes, heatRes] = await Promise.all([
      supabase
        .from('v_analytics_sales_daily')
        .select(
          'day, week, receipts, gross_revenue, refunds_thb, refund_receipts, net_revenue, discounts_thb, tax_thb, tips_thb, avg_check, cash_thb, card_thb, other_payment_thb, dine_in_receipts, takeaway_receipts, takeaway_thb',
        )
        .gte('day', salesFrom)
        .lte('day', range.end)
        .order('day', { ascending: true }),
      supabase
        .from('v_analytics_item_sales_daily')
        .select(
          'day, week, nomenclature_id, product_code, item_name, is_modifier, category_id, category_code, category_name, units, revenue',
        )
        .gte('day', range.start)
        .lte('day', range.end),
      // `week` is the LAST column of this view (appended by migration 473),
      // so it is selected by name — never rely on column order here.
      supabase
        .from('v_analytics_hourly_heat')
        .select('iso_dow, dow_label, hour_local, receipts, revenue, week')
        .gte('week', range.start)
        .lte('week', range.end),
    ])

    const failure = salesRes.error ?? itemsRes.error ?? heatRes.error
    if (failure) {
      console.error('[useAnalyticsSalesPulse] fetch error', failure)
      setError(failure.message)
      setIsLoading(false)
      return
    }

    setSales(
      (salesRes.data ?? []).map((r) => ({
        day: r.day as string,
        week: r.week as string,
        receipts: num(r.receipts),
        gross_revenue: num(r.gross_revenue),
        refunds_thb: num(r.refunds_thb),
        refund_receipts: num(r.refund_receipts),
        net_revenue: num(r.net_revenue),
        discounts_thb: num(r.discounts_thb),
        tax_thb: num(r.tax_thb),
        tips_thb: num(r.tips_thb),
        avg_check: num(r.avg_check),
        cash_thb: num(r.cash_thb),
        card_thb: num(r.card_thb),
        other_payment_thb: num(r.other_payment_thb),
        dine_in_receipts: num(r.dine_in_receipts),
        takeaway_receipts: num(r.takeaway_receipts),
        takeaway_thb: num(r.takeaway_thb),
      })),
    )

    setItems(
      (itemsRes.data ?? []).map((r) => ({
        day: r.day as string,
        week: r.week as string,
        nomenclature_id: r.nomenclature_id as string,
        product_code: (r.product_code as string | null) ?? '',
        item_name: (r.item_name as string | null) ?? 'Unnamed item',
        is_modifier: r.is_modifier === true,
        category_id: (r.category_id as string | null) ?? null,
        category_code: (r.category_code as string | null) ?? null,
        category_name: (r.category_name as string | null) ?? null,
        units: num(r.units),
        revenue: num(r.revenue),
      })),
    )

    setHeat(
      (heatRes.data ?? []).map((r) => ({
        iso_dow: num(r.iso_dow),
        dow_label: (r.dow_label as string | null) ?? '',
        hour_local: num(r.hour_local),
        receipts: num(r.receipts),
        revenue: num(r.revenue),
        week: r.week as string,
      })),
    )

    setIsLoading(false)
  }, [salesFrom, range.start, range.end])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { sales, items, heat, isLoading, error, refetch: fetchData }
}
