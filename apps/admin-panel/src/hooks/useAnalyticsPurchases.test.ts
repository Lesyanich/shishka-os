import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { periodRange } from '../lib/analytics'
import { previousWeekWindow } from '../lib/analyticsPurchases'

const tables: string[] = []
let bounds: Record<string, { gte?: string; lte?: string }> = {}
let failOn: string | null = null

function builderFor(table: string, rows: unknown[]) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    gt: () => builder,
    order: () => builder,
    limit: () => builder,
    gte: (_c: string, v: string) => {
      bounds[table] = { ...(bounds[table] ?? {}), gte: v }
      return builder
    },
    lte: (_c: string, v: string) => {
      bounds[table] = { ...(bounds[table] ?? {}), lte: v }
      return builder
    },
    then: (resolve: (v: { data: unknown[] | null; error: { message: string } | null }) => unknown) =>
      resolve(
        failOn === table
          ? { data: null, error: { message: `${table} denied` } }
          : { data: rows, error: null },
      ),
  }
  return builder
}

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      tables.push(table)
      switch (table) {
        case 'v_analytics_purchases_weekly':
          return builderFor(table, [
            { week: '2026-10-05', nomenclature_id: 'n1', thb: '100.5', lines: 2, cf_known: true, is_canonical: true },
          ])
        case 'v_analytics_purchase_coverage_weekly':
          return builderFor(table, [{ week: '2026-10-05', thb_total: '100.5', canonical_pct: null }])
        case 'v_analytics_price_watch':
          return builderFor(table, [
            { nomenclature_id: 'p1', last_unit_price: null, delta_pct: null, is_spike: true, cf_known: false, weeks_observed: 1 },
          ])
        case 'v_analytics_abc_items':
          return builderFor(table, [
            { nomenclature_id: 'consumed', purchase_thb_8w: '500', lines_8w: 1 },
            { nomenclature_id: 'orphan', purchase_thb_8w: '400', lines_8w: 1 },
          ])
        case 'v_analytics_food_cost_weekly':
          return builderFor(table, [
            { week: '2026-10-05', revenue: '1000', purchases_thb_all: '300', fc_actual_pct: null },
          ])
        case 'bom_structures':
          return builderFor(table, [{ ingredient_id: 'consumed' }])
        default:
          throw new Error(`PurchasesTab must not read ${table}`)
      }
    },
  },
}))

const { useAnalyticsPurchases } = await import('./useAnalyticsPurchases')

const RANGE = periodRange(8, '2026-10-16')

beforeEach(() => {
  tables.length = 0
  bounds = {}
  failOn = null
})

describe('useAnalyticsPurchases', () => {
  it('reads the five purchase views plus the approved BOM set, nothing else', async () => {
    const { result } = renderHook(() => useAnalyticsPurchases(RANGE))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect([...tables].sort()).toEqual([
      'bom_structures',
      'v_analytics_abc_items',
      'v_analytics_food_cost_weekly',
      'v_analytics_price_watch',
      'v_analytics_purchase_coverage_weekly',
      'v_analytics_purchases_weekly',
    ])
  })

  it('reaches back a whole-week window so supplier deltas have a baseline', async () => {
    const { result } = renderHook(() => useAnalyticsPurchases(RANGE))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const prev = previousWeekWindow(RANGE)
    expect(prev.start).toBe('2026-06-29')
    expect(bounds['v_analytics_purchases_weekly']).toEqual({ gte: prev.start, lte: RANGE.end })
  })

  it('does not try to filter the rolling-window views by week', async () => {
    const { result } = renderHook(() => useAnalyticsPurchases(RANGE))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Neither view carries a `week` column — filtering would throw.
    expect(bounds['v_analytics_price_watch']).toBeUndefined()
    expect(bounds['v_analytics_abc_items']).toBeUndefined()
  })

  it('coerces numeric strings and keeps real nulls null', async () => {
    const { result } = renderHook(() => useAnalyticsPurchases(RANGE))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.purchases[0].thb).toBe(100.5)
    // A missing percentage is not 0 %: it must stay null so the UI can say so.
    expect(result.current.priceWatch[0].delta_pct).toBeNull()
    expect(result.current.foodCost[0].fc_actual_pct).toBeNull()
    // …but a missing count is safely 0, so no sum becomes NaN.
    expect(result.current.coverage[0].canonical_pct).toBe(0)
  })

  it('resolves has_bom from the BOM set for every item', async () => {
    const { result } = renderHook(() => useAnalyticsPurchases(RANGE))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const byId = new Map(result.current.abcItems.map((r) => [r.nomenclature_id, r.has_bom]))
    expect(byId.get('consumed')).toBe(true)
    expect(byId.get('orphan')).toBe(false)
  })

  it('surfaces an error instead of rendering zeros as fact', async () => {
    failOn = 'bom_structures'
    const { result } = renderHook(() => useAnalyticsPurchases(RANGE))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBe('bom_structures denied')
    expect(result.current.purchases).toEqual([])
  })
})
