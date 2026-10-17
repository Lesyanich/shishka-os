import { describe, it, expect } from 'vitest'
import { periodRange } from './analytics'
import {
  countCoverage,
  foodCostGapSeries,
  inventoryValueSummary,
  reorderRows,
  expiringRows,
  varianceView,
  wasteSummary,
} from './analyticsStock'
import {
  BOM_COVERAGE,
  COUNT_DAY,
  COUNT_DAYS,
  INVENTORY,
  REPLENISHMENT,
  STOCK_STATUS,
  SYNTHETIC_VARIANCE,
  VARIANCE,
  WASTE,
} from './__fixtures__/analytics-stock-prod'
import { FOOD_COST } from './__fixtures__/analytics-purchases-prod'

/* ═══════════════════════════════════════════════════════════════════
   Prod parity — the acceptance proof for the Stock control tab.

   Real rows, with every expected figure measured independently by
   hand-written SQL on prod 2026-10-17.
   ═══════════════════════════════════════════════════════════════════ */

const RANGE = periodRange(8, '2026-10-16')

describe('inventory value vs SQL', () => {
  const s = inventoryValueSummary(INVENTORY)

  it('reproduces the total and the line count', () => {
    expect(s.lines).toBe(122)
    expect(s.totalThb).toBeCloseTo(19_014.83, 2)
  })

  it('reproduces every location subtotal', () => {
    expect(
      s.byLocation.map((l) => [l.location, Math.round(l.valueThb), l.lines]),
    ).toEqual([
      ['Fridge', 10_946, 79],
      ['Bar', 6_418, 31],
      ['Freezer', 1_651, 7],
      ['Chocolate Counter', 0, 5],
    ])
  })

  it('separates stock with no cost on file from stock counted as empty', () => {
    // SQL: 14 lines hold stock with no cost_per_unit; 2 more were counted at
    // zero. Conflating them would misreport the holding.
    expect(s.linesWithoutCost).toBe(14)
    expect(s.linesCountedEmpty).toBe(2)
  })

  it('accounts for the stub lines sitting in inventory', () => {
    // SQL: 4 lines on RAW-AUTO stubs holding THB 1,951.90 — a tenth of the total.
    expect(s.stubLines).toBe(4)
    expect(s.stubThb).toBeCloseTo(1_951.90, 2)
  })

  it('reports the age of the count, which is the headline caveat', () => {
    expect(s.countedOn).toBe(COUNT_DAY)
    expect(s.daysSinceCount).toBe(46)
  })

  it('shows the Chocolate Counter as zero because none of it has a cost', () => {
    const choc = s.byLocation.find((l) => l.location === 'Chocolate Counter')!
    expect(choc.valueThb).toBe(0)
    expect(choc.linesWithoutCost).toBe(5)
  })
})

describe('count coverage vs SQL', () => {
  const c = countCoverage(COUNT_DAYS)

  it('finds the single count day prod has', () => {
    expect(c.countDays).toBe(1)
    expect(c.latestCountDay).toBe(COUNT_DAY)
  })

  it('reproduces the items counted and the A-class share', () => {
    expect(c.itemsCounted).toBe(121)
    expect(c.aClassCounted).toBe(23)
  })

  it('reports that no interval exists — the reason the hero table is empty', () => {
    expect(c.hasInterval).toBe(false)
  })
})

describe('variance on prod — empty, and correctly so', () => {
  it('returns no rows, because an interval needs two count days', () => {
    const v = varianceView(VARIANCE)
    expect(v.rows).toEqual([])
    expect(v.interval).toBeNull()
    expect(v.droppedIncomplete).toBe(0)
  })
})

describe('variance arithmetic, against a SYNTHETIC interval', () => {
  /* Prod cannot fill this table yet, so the acceptance criterion "variance for
     >= 2 items hand-checked against the raw rows" is not satisfiable today.
     These assertions check the arithmetic and the threshold colouring instead,
     so the first REAL interval is not also the first run of untested code. */
  const v = varianceView(SYNTHETIC_VARIANCE)

  it('excludes the incomplete row rather than showing a phantom shortage', () => {
    expect(v.droppedIncomplete).toBe(1)
    expect(v.rows.map((r) => r.product_code)).not.toContain('RAW-ONION')
  })

  it('orders by how much money moved', () => {
    expect(v.rows.map((r) => r.product_code)).toEqual([
      'RAW-CHEESE-MOZZARELLA',
      'RAW-LETTUCE-ICEBERG',
      'RAW-POTATO',
    ])
  })

  it('colours each row by the spec thresholds', () => {
    expect(v.rows.map((r) => r.tone)).toEqual(['red', 'watch', 'ok'])
  })

  it('names the interval it is reporting', () => {
    expect(v.interval).toEqual({ from: '2026-09-01', to: '2026-09-08' })
  })

  it('keeps the balance identity: opening + purchases - usage - waste = expected', () => {
    for (const r of v.rows) {
      expect(r.opening_qty + r.purchases_qty - r.usage_qty - r.waste_qty).toBeCloseTo(
        r.expected_closing_qty,
        6,
      )
      expect(r.expected_closing_qty - r.closing_qty).toBeCloseTo(r.variance_qty, 6)
    }
  })
})

describe('waste on prod — empty, and correctly so', () => {
  const w = wasteSummary(WASTE, RANGE)

  it('has nothing to show because waste_logs has no rows', () => {
    expect(w.entries).toBe(0)
    expect(w.totalThb).toBe(0)
    expect(w.byReason).toEqual([])
    expect(w.weeks).toBe(0)
  })
})

describe('food cost gap vs SQL', () => {
  const series = foodCostGapSeries(FOOD_COST, RANGE)

  it('computes actual from ALL purchases, per the CEO decision', () => {
    // Week 2026-09-28: purchases 7,269 of revenue 9,393 = 77.39 percent.
    const wk = series.find((p) => p.week === '2026-09-28')!
    expect(wk.actualPct).toBeCloseTo(77.39, 2)
  })

  it('keeps the canonical-only figure apart, far lower, never as the gap', () => {
    const wk = series.find((p) => p.week === '2026-09-28')!
    // The view's own figure. Drawing the gap against this would have claimed
    // the kitchen was bleeding food cost when the spend is simply unattributed.
    expect(wk.canonicalOnlyPct).toBeCloseTo(14.26, 2)
    expect(wk.actualPct! - wk.canonicalOnlyPct!).toBeGreaterThan(60)
  })

  it('reproduces the theoretical figure SQL reports', () => {
    const wk = series.find((p) => p.week === '2026-09-28')!
    // cogs_theoretical 1,814.57 of revenue 9,393 = 19.32 percent.
    expect(wk.theoreticalPct).toBeCloseTo(19.32, 2)
  })

  it('states the gap in points and in THB', () => {
    const wk = series.find((p) => p.week === '2026-09-28')!
    expect(wk.gapPp).toBeCloseTo(77.39 - 19.32, 1)
    expect(wk.gapThb).toBeCloseTo(7_269 - 1_814.57, 2)
  })

  it('flags every week as purchases-based, because no week is bracketed by counts', () => {
    expect(series.every((p) => p.purchasesBased)).toBe(true)
  })

  it('returns null rather than zero for a week with no revenue', () => {
    const empty = foodCostGapSeries([], RANGE)
    expect(empty.every((p) => p.actualPct === null && p.theoreticalPct === null)).toBe(true)
  })
})

describe('reorder and expiring vs SQL', () => {
  it('finds the one item below par that prod has', () => {
    const rows = reorderRows(REPLENISHMENT)
    expect(rows).toHaveLength(1)
    expect(rows[0].product_code).toBe('RAW-CHIA-SEEDS')
    expect(rows[0].stock_status).toBe('out')
  })

  it('finds nothing expiring, because prod flags nothing', () => {
    expect(expiringRows(STOCK_STATUS)).toEqual([])
  })
})

describe('BOM coverage vs SQL', () => {
  it('reproduces the latest week', () => {
    const latest = [...BOM_COVERAGE].sort((a, b) => a.week.localeCompare(b.week)).at(-1)!
    expect(latest.week).toBe('2026-10-12')
    expect(latest.deducted_units_pct).toBeCloseTo(89.83, 2)
  })
})
