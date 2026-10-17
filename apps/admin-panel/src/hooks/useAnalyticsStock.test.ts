import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { periodRange } from '../lib/analytics'

const tables: string[] = []
let bounds: Record<string, { gte?: string; lte?: string }> = {}
let failOn: string | null = null

function builderFor(table: string, rows: unknown[]) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    order: () => builder,
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
        case 'v_analytics_stock_variance':
          return builderFor(table, [])
        case 'v_analytics_count_days':
          return builderFor(table, [
            { count_day: '2026-09-01', nomenclature_id: 'n1', counted_qty: '2', is_complete: true },
          ])
        case 'v_analytics_inventory_value':
          return builderFor(table, [
            // cost_per_unit null must survive: it is "no cost on file", not free.
            { nomenclature_id: 'n1', counted_qty: '3', cost_per_unit: null, value_thb: '0', days_since_count: '46' },
          ])
        case 'v_analytics_waste_weekly':
          return builderFor(table, [])
        case 'v_analytics_bom_coverage_weekly':
          return builderFor(table, [{ week: '2026-10-12', deducted_units_pct: null }])
        case 'v_analytics_food_cost_weekly':
          return builderFor(table, [{ week: '2026-10-12', revenue: '1000', purchases_thb_all: '300', fc_actual_pct: null }])
        case 'v_station_replenishment':
          return builderFor(table, [{ nomenclature_id: 'r1', name: 'Chia', suggested_qty: null }])
        case 'v_stock_status':
          return builderFor(table, [{ nomenclature_id: 's1', name: 'X', expiring_soon: '0', expired: '0' }])
        default:
          throw new Error(`StockControlTab must not read ${table}`)
      }
    },
  },
}))

const { useAnalyticsStock } = await import('./useAnalyticsStock')

const RANGE = periodRange(8, '2026-10-16')

beforeEach(() => {
  tables.length = 0
  bounds = {}
  failOn = null
})

describe('useAnalyticsStock', () => {
  it('reads the six analytics views plus the two the spec says to reuse', async () => {
    const { result } = renderHook(() => useAnalyticsStock(RANGE))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect([...tables].sort()).toEqual([
      'v_analytics_bom_coverage_weekly',
      'v_analytics_count_days',
      'v_analytics_food_cost_weekly',
      'v_analytics_inventory_value',
      'v_analytics_stock_variance',
      'v_analytics_waste_weekly',
      'v_station_replenishment',
      'v_stock_status',
    ])
  })

  it('filters the week-grain views on the week window', async () => {
    const { result } = renderHook(() => useAnalyticsStock(RANGE))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    for (const t of ['v_analytics_waste_weekly', 'v_analytics_bom_coverage_weekly', 'v_analytics_food_cost_weekly']) {
      expect(bounds[t]).toEqual({ gte: RANGE.weekStart, lte: RANGE.weekEnd })
    }
  })

  it('does not period-filter variance, counts or the live stock views', async () => {
    const { result } = renderHook(() => useAnalyticsStock(RANGE))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // The interval IS the period for variance; the other three are live state.
    for (const t of ['v_analytics_stock_variance', 'v_analytics_count_days', 'v_station_replenishment', 'v_stock_status']) {
      expect(bounds[t]).toBeUndefined()
    }
  })

  it('keeps a missing cost as null, not as zero', async () => {
    const { result } = renderHook(() => useAnalyticsStock(RANGE))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // The tile depends on this to tell "no cost on file" from "costs nothing".
    expect(result.current.inventory[0].cost_per_unit).toBeNull()
    expect(result.current.inventory[0].counted_qty).toBe(3)
  })

  it('keeps missing percentages null rather than 0 %', async () => {
    const { result } = renderHook(() => useAnalyticsStock(RANGE))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.bomCoverage[0].deducted_units_pct).toBeNull()
    expect(result.current.foodCost[0].fc_actual_pct).toBeNull()
    expect(result.current.replenishment[0].suggested_qty).toBeNull()
  })

  it('returns variance empty, as prod is', async () => {
    const { result } = renderHook(() => useAnalyticsStock(RANGE))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.variance).toEqual([])
  })

  it('surfaces an error instead of rendering zeros as fact', async () => {
    failOn = 'v_analytics_inventory_value'
    const { result } = renderHook(() => useAnalyticsStock(RANGE))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBe('v_analytics_inventory_value denied')
    expect(result.current.inventory).toEqual([])
  })
})
