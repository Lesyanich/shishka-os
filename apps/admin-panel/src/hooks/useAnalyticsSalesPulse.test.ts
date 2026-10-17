import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { periodRange } from '../lib/analytics'

const tables: string[] = []
let failOn: string | null = null

function queryResult(table: string, rows: unknown[]) {
  const builder = {
    select: () => builder,
    gte: (_col: string, v: string) => {
      bounds[table] = { ...(bounds[table] ?? {}), gte: v }
      return builder
    },
    lte: (_col: string, v: string) => {
      bounds[table] = { ...(bounds[table] ?? {}), lte: v }
      return builder
    },
    order: () => builder,
    then: (resolve: (v: { data: unknown[] | null; error: { message: string } | null }) => unknown) =>
      resolve(
        failOn === table
          ? { data: null, error: { message: `${table} denied` } }
          : { data: rows, error: null },
      ),
  }
  return builder
}

let bounds: Record<string, { gte?: string; lte?: string }> = {}

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      tables.push(table)
      if (table === 'v_analytics_sales_daily') {
        // A row with nulls where numerics are expected — the coercion guard.
        return queryResult(table, [
          { day: '2026-10-12', week: '2026-10-12', receipts: 3, gross_revenue: null },
        ])
      }
      if (table === 'v_analytics_item_sales_daily') {
        return queryResult(table, [
          { day: '2026-10-12', week: '2026-10-12', nomenclature_id: 'x', units: '2', revenue: '50' },
        ])
      }
      if (table === 'v_analytics_hourly_heat') {
        return queryResult(table, [
          { iso_dow: 1, hour_local: 12, receipts: 3, revenue: 100, week: '2026-10-12' },
        ])
      }
      throw new Error(`unexpected table ${table}`)
    },
  },
}))

const { useAnalyticsSalesPulse } = await import('./useAnalyticsSalesPulse')

const RANGE = periodRange(4, '2026-10-16')

beforeEach(() => {
  tables.length = 0
  bounds = {}
  failOn = null
})

describe('useAnalyticsSalesPulse', () => {
  it('reads only the three Sales-pulse views', async () => {
    const { result } = renderHook(() => useAnalyticsSalesPulse(RANGE))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect([...tables].sort()).toEqual([
      'v_analytics_hourly_heat',
      'v_analytics_item_sales_daily',
      'v_analytics_sales_daily',
    ])
  })

  it('reaches further back than the period so the 7d/28d deltas have a baseline', async () => {
    const { result } = renderHook(() => useAnalyticsSalesPulse(RANGE))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(bounds['v_analytics_sales_daily'].gte).toBe(RANGE.prevStart)
    expect(bounds['v_analytics_item_sales_daily'].gte).toBe(RANGE.start)
  })

  it('filters the heatmap by week, the column migration 473 added', async () => {
    const { result } = renderHook(() => useAnalyticsSalesPulse(RANGE))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(bounds['v_analytics_hourly_heat']).toEqual({ gte: RANGE.start, lte: RANGE.end })
  })

  it('coerces nulls and numeric strings so no sum becomes NaN', async () => {
    const { result } = renderHook(() => useAnalyticsSalesPulse(RANGE))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.sales[0].gross_revenue).toBe(0)
    expect(result.current.items[0].units).toBe(2)
    expect(result.current.items[0].revenue).toBe(50)
  })

  it('defaults a missing is_modifier to false rather than undefined', async () => {
    const { result } = renderHook(() => useAnalyticsSalesPulse(RANGE))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.items[0].is_modifier).toBe(false)
  })

  it('surfaces a view error instead of rendering zeros as fact', async () => {
    failOn = 'v_analytics_hourly_heat'
    const { result } = renderHook(() => useAnalyticsSalesPulse(RANGE))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBe('v_analytics_hourly_heat denied')
    expect(result.current.sales).toEqual([])
  })
})
