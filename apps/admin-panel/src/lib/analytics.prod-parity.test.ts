import { describe, it, expect } from 'vitest'
import {
  aggregateDishes,
  categoryMix,
  customRange,
  heatGrid,
  kpiStrip,
  pctDelta,
  periodRange,
  sumSales,
  topDishes,
  weeklySeries,
} from './analytics'
import {
  HEAT,
  ITEMS,
  PERIOD_START,
  SALES,
  SEPT_END,
  SEPT_START,
  TODAY,
} from './__fixtures__/analytics-prod'

/* ═══════════════════════════════════════════════════════════════════
   Prod parity — the acceptance proof for /analytics Sales pulse.

   These are REAL rows read off the prod views on 2026-10-16, with the
   expected answers computed by hand-written SQL that aggregates the
   same windows independently (GROUP BY in Postgres, not this code).
   If a number the owner sees on the tab ever stops matching SQL, one
   of these fails.

   Deterministic: every window is an absolute date range and `today` is
   frozen, so new sales cannot drift the fixture.

   Sources: v_analytics_sales_daily · v_analytics_item_sales_daily ·
   v_analytics_hourly_heat (migrations 463 + 473).
   ═══════════════════════════════════════════════════════════════════ */

/* ═══ The checks ═══ */

describe('prod parity — September 2026 (the acceptance figure)', () => {
  it('reproduces 177 receipts and THB 52,946 gross', () => {
    const sept = sumSales(SALES, SEPT_START, SEPT_END)
    expect(sept.receipts).toBe(177)
    expect(sept.gross).toBe(52_946)
  })

  it('reproduces refunds, net and takeaway for the same month', () => {
    const sept = sumSales(SALES, SEPT_START, SEPT_END)
    expect(sept.refunds).toBe(569)
    expect(sept.net).toBe(52_377)
    expect(sept.takeaway).toBe(20_097)
    expect(sept.tradingDays).toBe(27)
  })

  it('does not confuse the calendar month with the five September ISO weeks', () => {
    // 187 receipts fall in the ISO weeks 2026-08-31 … 2026-09-28, which spill
    // into late August and early October. Both numbers are right; comparing
    // them to each other is the mistake.
    const isoWeeks = sumSales(SALES, '2026-08-31', '2026-10-04')
    expect(isoWeeks.receipts).not.toBe(177)
  })
})

describe('prod parity — the selected 4-week period', () => {
  const range = periodRange(4, TODAY)

  it('starts on the Monday SQL bucketed to', () => {
    expect(range.start).toBe(PERIOD_START)
    expect(range.weekStarts).toEqual(['2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12'])
  })

  it('matches SQL on receipts, gross, refunds, takeaway and trading days', () => {
    const t = sumSales(SALES, range.start, range.end)
    expect(t.receipts).toBe(142)
    expect(t.gross).toBe(46_026)
    expect(t.refunds).toBe(569)
    expect(t.takeaway).toBe(21_395)
    expect(t.tradingDays).toBe(21)
  })

  it('matches SQL on average check to four decimals', () => {
    const t = sumSales(SALES, range.start, range.end)
    expect(t.avgCheck).toBeCloseTo(324.1268, 4)
  })

  it('matches SQL week by week, including takeaway share', () => {
    const series = weeklySeries(SALES, range)
    expect(series.map((p) => [p.week, p.receipts, p.gross])).toEqual([
      ['2026-09-21', 41, 12_259],
      ['2026-09-28', 27, 9_393],
      ['2026-10-05', 49, 17_128],
      ['2026-10-12', 25, 7_246],
    ])
    const shares = series.map((p) => Number(p.takeawayShare.toFixed(2)))
    expect(shares).toEqual([42.17, 29.44, 48.17, 71.89])
  })

  it('reports the KPI strip consistently with the period totals', () => {
    const k = kpiStrip(SALES, range)
    expect(k.receipts).toBe(142)
    expect(k.avgCheck).toBeCloseTo(324.1268, 4)
    // 7d = 2026-10-10 … 2026-10-16 → 75 + 4572 + 1137 + 1202 + 2658 + 2249
    expect(k.revenue7d).toBe(11_893)
  })
})

describe('prod parity — dishes and categories', () => {
  const range = periodRange(4, TODAY)
  const dishes = aggregateDishes(ITEMS, range)

  it('matches SQL on distinct items, units and revenue', () => {
    expect(dishes).toHaveLength(71)
    expect(dishes.reduce((s, d) => s + d.units, 0)).toBe(304)
    expect(dishes.reduce((s, d) => s + d.revenue, 0)).toBe(46_041)
  })

  it('reproduces SQL top-10 by units, in order', () => {
    expect(topDishes(dishes, 'units').map((d) => [d.product_code, d.units, d.revenue])).toEqual([
      ['SALE-TOAST_CHICKEN_TAWOOK', 39, 6_240],
      ['SALE-TOAST_KEBAB', 17, 3_230],
      ['SALE-BRK_EGGS_YOUR_WAY', 14, 2_226],
      ['SALE-WRAP_OPEN_ZAATAR_CHEESE', 13, 2_067],
      ['SALE-SMOOTHIE_ISLAND_GREEN', 11, 1_100],
      ['SALE-BYO_SIGNATURE', 10, 2_490],
      ['SALE-WRAP_FOLD_CHICKEN_AVOCADO', 9, 1_575],
      ['SALE-WRAP_FOLD_LAMB_TRUFFLE', 8, 1_832],
      ['SALE-CHICKEN_MEXICAN_SALAD', 8, 1_520],
      ['SALE-BYO_ADDON_GUACAMOLE', 8, 320],
    ])
  })

  it('reproduces SQL top-3 categories by revenue share', () => {
    const mix = categoryMix(dishes).slice(0, 3)
    expect(mix.map((c) => c.name)).toEqual(['KP-FIN-WRP', 'KP-FIN-BWL', 'KP-FIN-BYO'])
    expect(mix.map((c) => c.revenue)).toEqual([17_068, 4_373, 4_204])
    expect(mix.map((c) => Number(c.pct.toFixed(3)))).toEqual([37.071, 9.498, 9.131])
  })

  it('keeps the category shares summing to 100', () => {
    const total = categoryMix(dishes).reduce((s, c) => s + c.pct, 0)
    expect(total).toBeCloseTo(100, 6)
  })
})

describe('prod parity — day × hour heatmap', () => {
  const range = periodRange(4, TODAY)
  const grid = heatGrid(HEAT, range)

  it('matches SQL on total receipts, live cells and the busiest cell', () => {
    expect(grid.totalReceipts).toBe(142)
    expect(grid.liveCells).toBe(50)
    expect(grid.busiestCell).toBe(7)
  })

  it('ties the heatmap total back to v_analytics_sales_daily', () => {
    // The two views must agree for the same window — 142 = 142 on prod.
    expect(grid.totalReceipts).toBe(sumSales(SALES, range.start, range.end).receipts)
  })

  it('is driven by receipts, not the inverted revenue in the fixture', () => {
    // The fixture gives the QUIETEST cells the highest revenue. A revenue-based
    // grid would therefore report a busiest cell of 9,000-odd, not 7.
    expect(grid.busiestCell).toBe(7)
    expect(grid.totalReceipts).toBeLessThan(1_000)
  })

  it('flags this period as thin evidence, as prod genuinely is', () => {
    // 142 receipts over 50 lit cells = 2.84 per cell, under the threshold of 3.
    expect(grid.avgPerLiveCell).toBeCloseTo(2.84, 2)
    expect(grid.isSparse).toBe(true)
  })
})

/* ═══════════════════════════════════════════════════════════════════
   Custom from–to range vs SQL (CEO request 2026-10-17).

   Window: 1–15 October 2026 — deliberately starting and ending
   mid-week, which is where the week/day distinction bites. Every
   expected figure was measured on prod with `day <= 2026-10-16` so it
   matches this frozen fixture exactly.
   ═══════════════════════════════════════════════════════════════════ */

describe('prod parity — custom range 1–15 Oct', () => {
  const range = customRange('2026-10-01', '2026-10-15', TODAY)

  it('reports the chosen days, not the covering weeks', () => {
    const t = sumSales(SALES, range.start, range.end)
    expect(t.receipts).toBe(75)
    expect(t.gross).toBe(24_806)
  })

  it('compares against the equal-length window SQL measured', () => {
    const prior = sumSales(SALES, range.prevStart, range.prevEnd)
    expect([range.prevStart, range.prevEnd]).toEqual(['2026-09-16', '2026-09-30'])
    expect(prior.receipts).toBe(88)
    expect(prior.gross).toBe(26_500)
    // So the owner sees receipts down 14.8 % on the previous fortnight.
    expect(pctDelta(75, 88)).toBeCloseTo(-14.7727, 4)
  })

  it('puts the same day-range figures in the KPI strip', () => {
    const k = kpiStrip(SALES, range)
    expect(k.receipts).toBe(75)
    expect(k.receiptsDelta).toBeCloseTo(-14.7727, 4)
  })

  it('scopes dishes to the chosen days', () => {
    const dishes = aggregateDishes(ITEMS, range)
    expect(dishes.reduce((s, d) => s + d.units, 0)).toBe(162)
    expect(dishes.reduce((s, d) => s + d.revenue, 0)).toBe(24_856)
    expect(topDishes(dishes, 'units')[0].product_code).toBe('SALE-TOAST_CHICKEN_TAWOOK')
    expect(topDishes(dishes, 'units')[0].units).toBe(21)
  })

  it('keeps the category shares summing to 100 over a custom range', () => {
    const mix = categoryMix(aggregateDishes(ITEMS, range))
    expect(mix.reduce((s, c) => s + c.pct, 0)).toBeCloseTo(100, 6)
  })

  it('draws the weekly bars over whole covering weeks — 101, as SQL says', () => {
    // Days 2026-09-28 … 2026-10-16: 101 receipts / THB 33,767.
    const series = weeklySeries(SALES, range)
    expect(series).toHaveLength(3)
    expect(series.reduce((s, p) => s + p.receipts, 0)).toBe(101)
    expect(series.reduce((s, p) => s + p.gross, 0)).toBe(33_767)
  })

  it('ties the heatmap to the weekly bars, both on the covering weeks', () => {
    const grid = heatGrid(HEAT, range)
    const weekly = weeklySeries(SALES, range).reduce((s, p) => s + p.receipts, 0)
    expect(grid.totalReceipts).toBe(101)
    expect(grid.totalReceipts).toBe(weekly)
  })

  it('REGRESSION: the old week >= range.start filter must not come back', () => {
    // That filter answered 74 receipts / THB 24,374 for this range — neither
    // the day range (75 / 24,806) nor the covering weeks (101 / 33,767),
    // because a Monday bucket before the chosen start was dropped outright.
    const weekly = weeklySeries(SALES, range)
    const receipts = weekly.reduce((s, p) => s + p.receipts, 0)
    const gross = weekly.reduce((s, p) => s + p.gross, 0)
    expect(receipts).not.toBe(74)
    expect(gross).not.toBe(24_374)
    expect(heatGrid(HEAT, range).totalReceipts).not.toBe(74)
  })

  it('announces that the week-grain panels are showing more than was asked', () => {
    expect(range.snappedToWeeks).toBe(true)
  })
})

describe('prod parity — presets are untouched by the picker', () => {
  it('still reproduces September 2026 exactly', () => {
    const sept = sumSales(SALES, SEPT_START, SEPT_END)
    expect(sept.receipts).toBe(177)
    expect(sept.gross).toBe(52_946)
  })

  it('still reproduces the 4-week preset exactly', () => {
    const t = sumSales(SALES, periodRange(4, '2026-10-16').start, '2026-10-16')
    expect(t.receipts).toBe(142)
    expect(t.gross).toBe(46_026)
  })
})
