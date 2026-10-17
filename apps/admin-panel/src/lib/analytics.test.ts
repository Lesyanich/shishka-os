import { describe, it, expect } from 'vitest'
import {
  addDays,
  aggregateDishes,
  bangkokToday,
  categoryMix,
  daysInclusive,
  donutSlices,
  heatGrid,
  kpiStrip,
  mondayOf,
  pctDelta,
  periodRange,
  sumSales,
  topDishes,
  weeklySeries,
  DONUT_MAX_SLICES,
  OTHER_SLICE_NAME,
  type CategorySlice,
  type HourlyHeatRow,
  type ItemSalesRow,
  type SalesDailyRow,
} from './analytics'

/* ─── Fixture builders ─── */

function sales(day: string, over: Partial<SalesDailyRow> = {}): SalesDailyRow {
  return {
    day,
    week: mondayOf(day),
    receipts: 10,
    gross_revenue: 1000,
    refunds_thb: 0,
    refund_receipts: 0,
    net_revenue: 1000,
    discounts_thb: 0,
    tax_thb: 0,
    tips_thb: 0,
    avg_check: 100,
    cash_thb: 1000,
    card_thb: 0,
    other_payment_thb: 0,
    dine_in_receipts: 10,
    takeaway_receipts: 0,
    takeaway_thb: 0,
    ...over,
  }
}

function item(day: string, over: Partial<ItemSalesRow> = {}): ItemSalesRow {
  return {
    day,
    week: mondayOf(day),
    nomenclature_id: 'id-dish',
    product_code: 'SALE-DISH',
    item_name: 'Dish',
    is_modifier: false,
    category_id: 'cat-1',
    category_code: 'WRAPS',
    category_name: 'Wraps',
    units: 1,
    revenue: 100,
    ...over,
  }
}

function heat(week: string, over: Partial<HourlyHeatRow> = {}): HourlyHeatRow {
  return {
    iso_dow: 1,
    dow_label: 'Mon',
    hour_local: 12,
    receipts: 1,
    revenue: 100,
    week,
    ...over,
  }
}

/* ─── Date & period math ─── */

describe('date helpers', () => {
  it('mondayOf returns the containing ISO week start', () => {
    // 2026-10-16 is a Friday; 2026-10-12 is its Monday.
    expect(mondayOf('2026-10-16')).toBe('2026-10-12')
    expect(mondayOf('2026-10-12')).toBe('2026-10-12')
    // Sunday belongs to the week that started the previous Monday, not the next one.
    expect(mondayOf('2026-10-18')).toBe('2026-10-12')
  })

  it('crosses a month boundary without drifting', () => {
    expect(mondayOf('2026-09-01')).toBe('2026-08-31')
    expect(addDays('2026-08-31', -1)).toBe('2026-08-30')
    expect(daysInclusive('2026-09-01', '2026-09-30')).toBe(30)
  })

  it('bangkokToday rolls over ahead of UTC', () => {
    // 18:00 UTC on the 15th is already the 16th in Bangkok (UTC+7).
    expect(bangkokToday(new Date('2026-10-15T18:00:00Z'))).toBe('2026-10-16')
    expect(bangkokToday(new Date('2026-10-15T10:00:00Z'))).toBe('2026-10-15')
  })
})

describe('periodRange', () => {
  it('spans N ISO weeks ending with the week in progress', () => {
    const r = periodRange(4, '2026-10-16')
    expect(r.currentWeekStart).toBe('2026-10-12')
    expect(r.start).toBe('2026-09-21')
    expect(r.end).toBe('2026-10-16')
    expect(r.weekStarts).toEqual(['2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12'])
  })

  it('compares against an equal number of days, not N whole weeks', () => {
    const r = periodRange(4, '2026-10-16')
    // 21 Sep → 16 Oct is 26 days (3 full weeks + a 5-day part week).
    expect(daysInclusive(r.start, r.end)).toBe(26)
    expect(r.prevEnd).toBe('2026-09-20')
    expect(daysInclusive(r.prevStart, r.prevEnd)).toBe(26)
  })

  it('honours all three selector choices', () => {
    expect(periodRange(8, '2026-10-16').weekStarts).toHaveLength(8)
    expect(periodRange(13, '2026-10-16').weekStarts).toHaveLength(13)
  })
})

/* ─── Sales totals ─── */

describe('sumSales', () => {
  const rows = [
    sales('2026-09-28', { receipts: 5, gross_revenue: 500, refunds_thb: 50, net_revenue: 450 }),
    sales('2026-10-01', { receipts: 7, gross_revenue: 900, takeaway_thb: 300 }),
    sales('2026-10-20', { receipts: 99, gross_revenue: 9999 }), // outside the window
  ]

  it('sums only rows inside the window, inclusive of both ends', () => {
    const t = sumSales(rows, '2026-09-28', '2026-10-01')
    expect(t.receipts).toBe(12)
    expect(t.gross).toBe(1400)
    expect(t.refunds).toBe(50)
    expect(t.takeaway).toBe(300)
    expect(t.tradingDays).toBe(2)
  })

  it('computes avg check as gross ÷ receipts, not the mean of daily averages', () => {
    // Daily averages are 100 and ~128.6; their mean (114.3) is NOT the answer.
    expect(sumSales(rows, '2026-09-28', '2026-10-01').avgCheck).toBeCloseTo(1400 / 12, 6)
  })

  it('never divides by zero on an empty window', () => {
    const t = sumSales(rows, '2026-01-01', '2026-01-31')
    expect(t.receipts).toBe(0)
    expect(t.avgCheck).toBe(0)
    expect(t.tradingDays).toBe(0)
  })
})

describe('pctDelta', () => {
  it('returns a signed percentage', () => {
    expect(pctDelta(110, 100)).toBeCloseTo(10)
    expect(pctDelta(90, 100)).toBeCloseTo(-10)
  })

  it('is undefined with no baseline, rather than Infinity or 0', () => {
    expect(pctDelta(100, 0)).toBeUndefined()
    expect(pctDelta(0, 0)).toBeUndefined()
  })
})

describe('kpiStrip', () => {
  // 1000 THB / 10 receipts a day for 14 days ending 2026-10-16.
  const rows = Array.from({ length: 14 }, (_, i) => sales(addDays('2026-10-16', -i)))

  it('reads 7d as a fixed rolling window against the 7 days before it', () => {
    const k = kpiStrip(rows, periodRange(4, '2026-10-16'))
    expect(k.revenue7d).toBe(7000)
    expect(k.revenue7dDelta).toBeCloseTo(0) // both weeks identical
  })

  it('scopes receipts and avg check to the selected period', () => {
    const k = kpiStrip(rows, periodRange(4, '2026-10-16'))
    expect(k.receipts).toBe(140)
    expect(k.avgCheck).toBeCloseTo(100)
  })

  it('shows 7d growth when the prior week was quieter', () => {
    const grow = [
      ...Array.from({ length: 7 }, (_, i) => sales(addDays('2026-10-16', -i), { gross_revenue: 2000 })),
      ...Array.from({ length: 7 }, (_, i) => sales(addDays('2026-10-09', -i), { gross_revenue: 1000 })),
    ]
    const k = kpiStrip(grow, periodRange(4, '2026-10-16'))
    expect(k.revenue7d).toBe(14000)
    expect(k.revenue7dDelta).toBeCloseTo(100)
  })
})

/* ─── Weekly series ─── */

describe('weeklySeries', () => {
  const range = periodRange(4, '2026-10-16')

  it('emits one point per ISO week, including weeks with no sales', () => {
    const series = weeklySeries([sales('2026-10-13', { gross_revenue: 800 })], range)
    expect(series).toHaveLength(4)
    expect(series.map((p) => p.week)).toEqual(range.weekStarts)
    // A silent week must read as a zero bar, not vanish off the axis.
    expect(series[0].gross).toBe(0)
    expect(series[3].gross).toBe(800)
  })

  it('stacks refunds on top of a net base that sums to gross', () => {
    const series = weeklySeries(
      [sales('2026-10-13', { gross_revenue: 1000, refunds_thb: 150 })],
      range,
    )
    const wk = series[3]
    expect(wk.netBar).toBe(850)
    expect(wk.netBar + wk.refunds).toBe(wk.gross)
  })

  it('reports takeaway share as a percentage of gross', () => {
    const series = weeklySeries(
      [sales('2026-10-13', { gross_revenue: 1000, takeaway_thb: 250 })],
      range,
    )
    expect(series[3].takeawayShare).toBeCloseTo(25)
  })

  it('flags the in-progress week so a part-week cannot read as a crash', () => {
    const series = weeklySeries([sales('2026-10-13')], range)
    expect(series.filter((p) => p.isPartial).map((p) => p.week)).toEqual(['2026-10-12'])
  })
})

/* ─── The modifier trap ─── */

describe('aggregateDishes — modifier exclusion', () => {
  const range = periodRange(4, '2026-10-16')

  it('NEVER counts a modifier line as a dish', () => {
    const rows = [
      item('2026-10-13', { nomenclature_id: 'dish', item_name: 'Wrap', units: 3, revenue: 600 }),
      item('2026-10-13', {
        nomenclature_id: 'mod',
        product_code: 'MOD-EXTRA-CHEESE',
        item_name: 'Extra cheese',
        is_modifier: true,
        units: 99,
        revenue: 9900,
      }),
    ]

    const dishes = aggregateDishes(rows, range)
    expect(dishes).toHaveLength(1)
    expect(dishes[0].nomenclature_id).toBe('dish')
    expect(dishes[0].units).toBe(3)
    // The headline failure this guards: 3 + 99 units, or 600 + 9900 THB.
    expect(dishes.reduce((s, d) => s + d.units, 0)).toBe(3)
    expect(dishes.reduce((s, d) => s + d.revenue, 0)).toBe(600)
  })

  it('keeps modifiers out of the top-10 and the category mix too', () => {
    const rows = [
      item('2026-10-13', { nomenclature_id: 'dish', units: 1, revenue: 100 }),
      item('2026-10-13', {
        nomenclature_id: 'mod',
        is_modifier: true,
        item_name: 'Extra shot',
        category_name: 'Coffee',
        units: 50,
        revenue: 5000,
      }),
    ]
    const dishes = aggregateDishes(rows, range)

    expect(topDishes(dishes, 'units').map((d) => d.item_name)).toEqual(['Dish'])
    expect(categoryMix(dishes).map((c) => c.name)).toEqual(['Wraps'])
    expect(categoryMix(dishes)[0].pct).toBeCloseTo(100)
  })

  it('sums the same dish across days and ignores days outside the period', () => {
    const rows = [
      item('2026-10-13', { units: 2, revenue: 200 }),
      item('2026-10-14', { units: 3, revenue: 300 }),
      item('2026-01-05', { units: 77, revenue: 7700 }),
    ]
    const dishes = aggregateDishes(rows, range)
    expect(dishes).toHaveLength(1)
    expect(dishes[0].units).toBe(5)
    expect(dishes[0].revenue).toBe(500)
  })

  it('labels a missing category instead of dropping the row', () => {
    const dishes = aggregateDishes([item('2026-10-13', { category_name: null })], range)
    expect(dishes[0].category_name).toBe('Uncategorised')
  })
})

describe('topDishes', () => {
  const dishes = [
    { nomenclature_id: 'a', product_code: 'A', item_name: 'A', category_name: 'X', units: 1, revenue: 900 },
    { nomenclature_id: 'b', product_code: 'B', item_name: 'B', category_name: 'X', units: 9, revenue: 100 },
  ]

  it('ranks by the requested metric', () => {
    expect(topDishes(dishes, 'units').map((d) => d.item_name)).toEqual(['B', 'A'])
    expect(topDishes(dishes, 'revenue').map((d) => d.item_name)).toEqual(['A', 'B'])
  })

  it('caps the list at the limit', () => {
    expect(topDishes(dishes, 'units', 1)).toHaveLength(1)
  })
})

describe('donutSlices', () => {
  const make = (n: number): CategorySlice[] =>
    Array.from({ length: n }, (_, i) => ({
      name: `cat-${i}`,
      // Descending, with a tail far below one degree of arc.
      revenue: n - i,
      units: 1,
      pct: ((n - i) / ((n * (n + 1)) / 2)) * 100,
    }))

  it('passes a short list through untouched', () => {
    const few = make(DONUT_MAX_SLICES)
    expect(donutSlices(few)).toEqual(few)
    expect(donutSlices(make(3))).toHaveLength(3)
  })

  it('folds everything past the cap into one named wedge', () => {
    const grouped = donutSlices(make(18))
    expect(grouped).toHaveLength(DONUT_MAX_SLICES + 1)
    expect(grouped[grouped.length - 1].name).toBe(OTHER_SLICE_NAME)
  })

  it('loses no revenue, no units and no percentage in the fold', () => {
    const all = make(18)
    const grouped = donutSlices(all)
    const sum = (rows: CategorySlice[], k: 'revenue' | 'units' | 'pct') =>
      rows.reduce((s, r) => s + r[k], 0)

    expect(sum(grouped, 'revenue')).toBe(sum(all, 'revenue'))
    expect(sum(grouped, 'units')).toBe(sum(all, 'units'))
    expect(sum(grouped, 'pct')).toBeCloseTo(sum(all, 'pct'), 9)
    expect(sum(grouped, 'pct')).toBeCloseTo(100, 9)
  })

  it('keeps the head slices exactly as they were, in order', () => {
    const all = make(18)
    expect(donutSlices(all).slice(0, DONUT_MAX_SLICES)).toEqual(all.slice(0, DONUT_MAX_SLICES))
  })

  it('honours a custom cap', () => {
    const grouped = donutSlices(make(10), 3)
    expect(grouped).toHaveLength(4)
    // make(10) revenues are 10…1; head takes 10+9+8, so the tail is 7+…+1.
    expect(grouped[3].revenue).toBe(28)
    expect(grouped.slice(0, 3).map((g) => g.revenue)).toEqual([10, 9, 8])
  })
})

/* ─── The heatmap trap ─── */

describe('heatGrid', () => {
  const range = periodRange(4, '2026-10-16')

  it('plots RECEIPTS, not revenue', () => {
    const rows = [
      // One big-ticket receipt — would dominate a revenue heatmap.
      heat('2026-10-12', { iso_dow: 1, hour_local: 11, receipts: 1, revenue: 9999 }),
      // Five small ones — the genuinely busy hour.
      heat('2026-10-12', { iso_dow: 2, hour_local: 12, receipts: 5, revenue: 100 }),
    ]
    const grid = heatGrid(rows, range)

    expect(grid.busiestCell).toBe(5)
    expect(grid.cells.get('2-12')?.intensity).toBe(1)
    expect(grid.cells.get('1-11')?.intensity).toBeCloseTo(1 / 5)
    expect(grid.totalReceipts).toBe(6)
  })

  it('restricts cells to weeks inside the period', () => {
    const rows = [
      heat('2026-10-12', { receipts: 4 }),
      heat('2026-05-18', { receipts: 100 }), // long before the 4-week window
    ]
    const grid = heatGrid(rows, range)
    expect(grid.totalReceipts).toBe(4)
    expect(grid.liveCells).toBe(1)
  })

  it('sums the same cell across the weeks of the period', () => {
    const rows = [
      heat('2026-10-05', { iso_dow: 3, hour_local: 16, receipts: 2 }),
      heat('2026-10-12', { iso_dow: 3, hour_local: 16, receipts: 3 }),
    ]
    const grid = heatGrid(rows, range)
    expect(grid.cells.get('3-16')?.receipts).toBe(5)
    expect(grid.liveCells).toBe(1)
  })

  it('flags a sparse grid so single receipts do not read as a pattern', () => {
    const thin = heatGrid(
      [
        heat('2026-10-12', { iso_dow: 1, hour_local: 11, receipts: 1 }),
        heat('2026-10-12', { iso_dow: 2, hour_local: 12, receipts: 1 }),
      ],
      range,
    )
    expect(thin.avgPerLiveCell).toBeCloseTo(1)
    expect(thin.isSparse).toBe(true)

    const solid = heatGrid([heat('2026-10-12', { iso_dow: 1, hour_local: 11, receipts: 9 })], range)
    expect(solid.isSparse).toBe(false)
  })

  it('lists only the hours that traded, ascending', () => {
    const rows = [
      heat('2026-10-12', { hour_local: 17 }),
      heat('2026-10-12', { hour_local: 9, iso_dow: 2 }),
      heat('2026-10-12', { hour_local: 12, iso_dow: 3 }),
    ]
    expect(heatGrid(rows, range).hours).toEqual([9, 12, 17])
  })

  it('stays safe on an empty period', () => {
    const grid = heatGrid([], range)
    expect(grid.totalReceipts).toBe(0)
    expect(grid.busiestCell).toBe(0)
    expect(grid.avgPerLiveCell).toBe(0)
    expect(grid.isSparse).toBe(false)
    expect(grid.hours).toEqual([])
  })
})
