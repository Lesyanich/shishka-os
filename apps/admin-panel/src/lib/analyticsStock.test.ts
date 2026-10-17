import { describe, it, expect } from 'vitest'
import { periodRange } from './analytics'
import {
  COUNT_STALE_DAYS,
  countCoverage,
  expiringRows,
  foodCostGapSeries,
  inventoryValueSummary,
  reorderRows,
  varianceView,
  wasteSummary,
  type CountDayRow,
  type InventoryValueRow,
  type ReplenishmentRow,
  type StockStatusRow,
  type StockVarianceRow,
  type WasteWeekRow,
} from './analyticsStock'
import type { FoodCostWeekRow } from './analyticsPurchases'

const RANGE = periodRange(4, '2026-10-16')

function inv(over: Partial<InventoryValueRow> = {}): InventoryValueRow {
  return {
    nomenclature_id: 'n1',
    product_code: 'RAW-X',
    item_name: 'X',
    base_unit: 'kg',
    location_id: 'l1',
    location_name: 'Fridge',
    counted_qty: 2,
    cost_per_unit: 100,
    value_thb: 200,
    counted_on: '2026-09-01',
    days_since_count: 46,
    count_class: 'A',
    is_canonical: true,
    ...over,
  }
}

function countDay(over: Partial<CountDayRow> = {}): CountDayRow {
  return {
    count_day: '2026-09-01',
    nomenclature_id: 'n1',
    product_code: 'RAW-X',
    item_name: 'X',
    base_unit: 'kg',
    count_class: 'A',
    counted_qty: 1,
    locations_counted: 1,
    locations_expected: 1,
    stations_counted: 1,
    is_complete: true,
    counted_thb: 10,
    ...over,
  }
}

function variance(over: Partial<StockVarianceRow> = {}): StockVarianceRow {
  return {
    opening_day: '2026-09-01',
    closing_day: '2026-09-08',
    days_in_interval: 7,
    nomenclature_id: 'n1',
    product_code: 'RAW-X',
    item_name: 'X',
    base_unit: 'kg',
    count_class: 'A',
    is_complete: true,
    opening_qty: 10,
    purchases_qty: 0,
    purchases_thb: 0,
    usage_qty: 5,
    waste_qty: 0,
    expected_closing_qty: 5,
    closing_qty: 5,
    variance_qty: 0,
    variance_thb: 0,
    variance_pct_of_usage: 0,
    ...over,
  }
}

function waste(over: Partial<WasteWeekRow> = {}): WasteWeekRow {
  return {
    week: '2026-10-12',
    reason: 'expiration',
    entries: 1,
    items: 1,
    qty: 1,
    thb: 100,
    thb_liability_cafe: 100,
    thb_liability_employee: 0,
    thb_liability_supplier: 0,
    ...over,
  }
}

function foodCost(over: Partial<FoodCostWeekRow> = {}): FoodCostWeekRow {
  return {
    week: '2026-10-12',
    revenue: 1000,
    receipts: 10,
    cogs_theoretical: 200,
    purchases_thb_canonical: 100,
    purchases_thb_all: 300,
    inventory_close_thb: null,
    inventory_open_thb: null,
    inventory_delta_thb: null,
    cogs_actual: 100,
    cogs_actual_basis: 'purchases_based',
    fc_theoretical_pct: 20,
    fc_actual_pct: 10,
    gap_thb: null,
    ...over,
  }
}

describe('inventoryValueSummary', () => {
  it('groups by location, biggest first', () => {
    const s = inventoryValueSummary([
      inv({ location_name: 'Bar', value_thb: 50 }),
      inv({ location_name: 'Fridge', value_thb: 500 }),
    ])
    expect(s.byLocation.map((l) => l.location)).toEqual(['Fridge', 'Bar'])
    expect(s.totalThb).toBe(550)
  })

  it('labels a missing location instead of dropping the value', () => {
    const s = inventoryValueSummary([inv({ location_name: null })])
    expect(s.byLocation[0].location).toBe('(no location)')
    expect(s.totalThb).toBe(200)
  })

  it('counts stock held with no cost as an understatement', () => {
    const s = inventoryValueSummary([inv({ counted_qty: 5, cost_per_unit: null, value_thb: 0 })])
    expect(s.linesWithoutCost).toBe(1)
    expect(s.linesCountedEmpty).toBe(0)
  })

  it('does not call a zero count an understatement', () => {
    // Counted and genuinely empty: its zero is correct.
    const s = inventoryValueSummary([inv({ counted_qty: 0, cost_per_unit: 100, value_thb: 0 })])
    expect(s.linesWithoutCost).toBe(0)
    expect(s.linesCountedEmpty).toBe(1)
  })

  it('treats a zero cost the same as a missing one', () => {
    const s = inventoryValueSummary([inv({ counted_qty: 5, cost_per_unit: 0, value_thb: 0 })])
    expect(s.linesWithoutCost).toBe(1)
  })

  it('tracks the value sitting on stub items', () => {
    const s = inventoryValueSummary([
      inv({ is_canonical: false, value_thb: 300 }),
      inv({ is_canonical: true, value_thb: 100 }),
    ])
    expect(s.stubLines).toBe(1)
    expect(s.stubThb).toBe(300)
  })

  it('takes the most recent count day when they differ', () => {
    const s = inventoryValueSummary([
      inv({ counted_on: '2026-09-01', days_since_count: 46 }),
      inv({ counted_on: '2026-10-01', days_since_count: 16 }),
    ])
    expect(s.countedOn).toBe('2026-10-01')
    expect(s.daysSinceCount).toBe(16)
  })

  it('is safe on no rows', () => {
    const s = inventoryValueSummary([])
    expect(s.totalThb).toBe(0)
    expect(s.byLocation).toEqual([])
    expect(s.countedOn).toBeNull()
  })

  it('keeps the staleness threshold where the UI expects it', () => {
    expect(COUNT_STALE_DAYS).toBe(14)
  })
})

describe('countCoverage', () => {
  it('reports no interval from a single count day', () => {
    const c = countCoverage([countDay(), countDay({ nomenclature_id: 'n2' })])
    expect(c.countDays).toBe(1)
    expect(c.hasInterval).toBe(false)
    expect(c.itemsCounted).toBe(2)
  })

  it('reports an interval once a second count day exists', () => {
    const c = countCoverage([countDay(), countDay({ count_day: '2026-09-08' })])
    expect(c.countDays).toBe(2)
    expect(c.hasInterval).toBe(true)
  })

  it('describes the LATEST count day, not all of them', () => {
    const c = countCoverage([
      countDay({ count_day: '2026-09-01' }),
      countDay({ count_day: '2026-09-08', nomenclature_id: 'a' }),
      countDay({ count_day: '2026-09-08', nomenclature_id: 'b' }),
    ])
    expect(c.latestCountDay).toBe('2026-09-08')
    expect(c.itemsCounted).toBe(2)
  })

  it('counts the A-class items and the incomplete ones', () => {
    const c = countCoverage([
      countDay({ count_class: 'A' }),
      countDay({ count_class: 'B', nomenclature_id: 'n2' }),
      countDay({ count_class: 'A', nomenclature_id: 'n3', is_complete: false }),
    ])
    expect(c.aClassCounted).toBe(2)
    expect(c.incompleteItems).toBe(1)
  })

  it('is safe with no counts at all', () => {
    const c = countCoverage([])
    expect(c.latestCountDay).toBeNull()
    expect(c.hasInterval).toBe(false)
  })
})

describe('varianceView', () => {
  it('reports only the latest interval', () => {
    const v = varianceView([
      variance({ closing_day: '2026-09-08', variance_thb: 10 }),
      variance({ closing_day: '2026-09-15', nomenclature_id: 'n2', variance_thb: 20 }),
    ])
    expect(v.rows).toHaveLength(1)
    expect(v.interval?.to).toBe('2026-09-15')
  })

  it('drops incomplete rows and says how many', () => {
    const v = varianceView([
      variance(),
      variance({ nomenclature_id: 'n2', is_complete: false }),
    ])
    expect(v.rows).toHaveLength(1)
    expect(v.droppedIncomplete).toBe(1)
  })

  it('accumulates THB per item across the trailing intervals', () => {
    const v = varianceView([
      variance({ closing_day: '2026-09-08', variance_thb: 150 }),
      variance({ closing_day: '2026-09-15', variance_thb: 150 }),
    ])
    // Same item, 150 + 150 = 300, which is the cumulative red rule.
    expect(v.rows[0].cumulativeAbsThb).toBe(300)
    expect(v.rows[0].tone).toBe('red')
  })

  it('sums magnitudes, so a surplus then a shortage still accumulates', () => {
    const v = varianceView([
      variance({ closing_day: '2026-09-08', variance_thb: -200 }),
      variance({ closing_day: '2026-09-15', variance_thb: 150 }),
    ])
    expect(v.rows[0].cumulativeAbsThb).toBe(350)
  })

  it('is safe and interval-less on no rows', () => {
    expect(varianceView([])).toEqual({ rows: [], droppedIncomplete: 0, interval: null })
  })
})

describe('wasteSummary', () => {
  it('groups by reason, biggest first', () => {
    const w = wasteSummary(
      [
        waste({ reason: 'spillage_damage', thb: 50 }),
        waste({ reason: 'expiration', thb: 500 }),
      ],
      RANGE,
    )
    expect(w.byReason.map((r) => r.reason)).toEqual(['expiration', 'spillage_damage'])
    expect(w.totalThb).toBe(550)
  })

  it('splits the liability', () => {
    const w = wasteSummary(
      [waste({ thb: 100, thb_liability_cafe: 60, thb_liability_employee: 40, thb_liability_supplier: 0 })],
      RANGE,
    )
    expect(w.liability).toEqual({ cafe: 60, employee: 40, supplier: 0 })
  })

  it('filters on the week window, not the chosen days', () => {
    const w = wasteSummary([waste({ week: '2026-01-05', thb: 999 })], RANGE)
    expect(w.totalThb).toBe(0)
  })

  it('is safe and empty with no waste logged', () => {
    const w = wasteSummary([], RANGE)
    expect(w.entries).toBe(0)
    expect(w.byReason).toEqual([])
  })
})

describe('foodCostGapSeries', () => {
  it('uses ALL purchases for actual, not the canonical-only figure', () => {
    const s = foodCostGapSeries([foodCost()], RANGE)
    const wk = s.find((p) => p.week === '2026-10-12')!
    expect(wk.actualPct).toBeCloseTo(30) // 300 / 1000
    expect(wk.canonicalOnlyPct).toBeCloseTo(10) // the view's own
    expect(wk.theoreticalPct).toBeCloseTo(20) // 200 / 1000
  })

  it('states the gap both ways', () => {
    const wk = foodCostGapSeries([foodCost()], RANGE).find((p) => p.week === '2026-10-12')!
    expect(wk.gapPp).toBeCloseTo(10)
    expect(wk.gapThb).toBeCloseTo(100)
  })

  it('emits a point per ISO week in the period, including silent ones', () => {
    const s = foodCostGapSeries([foodCost()], RANGE)
    expect(s).toHaveLength(4)
    expect(s[0].actualPct).toBeNull()
  })

  it('returns null rather than zero when there was no revenue', () => {
    const s = foodCostGapSeries([foodCost({ revenue: 0 })], RANGE)
    const wk = s.find((p) => p.week === '2026-10-12')!
    expect(wk.actualPct).toBeNull()
    expect(wk.theoreticalPct).toBeNull()
    expect(wk.gapPp).toBeNull()
  })

  it('marks a week as purchases-based when no counts bracket it', () => {
    const s = foodCostGapSeries([foodCost()], RANGE)
    expect(s.find((p) => p.week === '2026-10-12')!.purchasesBased).toBe(true)
  })

  it('stops marking it once a week is bracketed by counts', () => {
    const s = foodCostGapSeries([foodCost({ cogs_actual_basis: 'counted' })], RANGE)
    expect(s.find((p) => p.week === '2026-10-12')!.purchasesBased).toBe(false)
  })
})

describe('reorderRows', () => {
  function rep(over: Partial<ReplenishmentRow> = {}): ReplenishmentRow {
    return {
      nomenclature_id: 'n1',
      product_code: 'RAW-X',
      name: 'X',
      base_unit: 'kg',
      location_name: 'Bar',
      on_hand: 0,
      min_stock: 1,
      par_stock: 2,
      suggested_qty: 1,
      stock_status: 'out',
      replenish_action: 'purchase',
      ...over,
    }
  }

  it('keeps only items that actually need buying', () => {
    expect(reorderRows([rep({ suggested_qty: 0 }), rep({ name: 'Y' })])).toHaveLength(1)
  })

  it('puts the biggest need first and caps the list', () => {
    const rows = reorderRows([rep({ name: 'small', suggested_qty: 1 }), rep({ name: 'big', suggested_qty: 9 })], 1)
    expect(rows.map((r) => r.name)).toEqual(['big'])
  })

  it('treats a null suggestion as nothing needed', () => {
    expect(reorderRows([rep({ suggested_qty: null })])).toEqual([])
  })
})

describe('expiringRows', () => {
  function st(over: Partial<StockStatusRow> = {}): StockStatusRow {
    return {
      nomenclature_id: 'n1',
      product_code: 'RAW-X',
      name: 'X',
      storage_location: 'Fridge',
      next_expiry: '2026-10-20T00:00:00Z',
      expiring_soon: 1,
      expired: 0,
      ...over,
    }
  }

  it('keeps only rows with something expiring or expired', () => {
    expect(expiringRows([st({ expiring_soon: 0, expired: 0 }), st()])).toHaveLength(1)
  })

  it('puts already-expired ahead of merely expiring', () => {
    const rows = expiringRows([st({ name: 'soon' }), st({ name: 'gone', expired: 2 })])
    expect(rows.map((r) => r.name)).toEqual(['gone', 'soon'])
  })

  it('is safe on no rows', () => {
    expect(expiringRows([])).toEqual([])
  })
})
