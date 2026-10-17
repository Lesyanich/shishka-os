import { describe, it, expect } from 'vitest'
import { mondayOf } from '../analytics'
import {
  ABC_ITEMS,
  COVERAGE,
  FOOD_COST,
  PRICE_WATCH,
  PURCHASES,
  TODAY,
  WINDOW_8W_END,
  WINDOW_8W_START,
} from './analytics-purchases-prod'

/* Guards on the fixture itself. These rows are the acceptance evidence for the
   Purchases tab; if the fixture quietly loses or gains rows, every parity check
   built on it becomes meaningless while still passing. */

describe('purchases fixture integrity', () => {
  it('carries the row counts read off prod on 2026-10-17', () => {
    expect(PURCHASES).toHaveLength(53)
    expect(COVERAGE).toHaveLength(8)
    expect(FOOD_COST).toHaveLength(13)
    expect(PRICE_WATCH).toHaveLength(25)
    expect(ABC_ITEMS).toHaveLength(22)
  })

  it('is anchored to a frozen window, so incoming purchases cannot drift it', () => {
    expect(TODAY).toBe('2026-10-17')
    expect(WINDOW_8W_START).toBe('2026-08-24')
    expect(WINDOW_8W_END).toBe('2026-10-16')
  })

  it('buckets every week to the Monday the views bucket to', () => {
    for (const r of PURCHASES) expect(mondayOf(r.week)).toBe(r.week)
    for (const r of COVERAGE) expect(mondayOf(r.week)).toBe(r.week)
    for (const r of FOOD_COST) expect(mondayOf(r.week)).toBe(r.week)
  })

  it('reaches back far enough to compare against the previous 8 whole weeks', () => {
    // previousWeekWindow(8 weeks from 2026-10-16) = 2026-06-29 … 2026-08-17.
    expect(PURCHASES.some((r) => r.week === '2026-06-29')).toBe(true)
    expect(PURCHASES.some((r) => r.week === '2026-08-17')).toBe(true)
  })

  it('keeps the prod reality that most purchase THB is NOT on canonical items', () => {
    const total = COVERAGE.reduce((s, r) => s + r.thb_total, 0)
    const canonical = COVERAGE.reduce((s, r) => s + r.thb_canonical, 0)
    expect((canonical / total) * 100).toBeLessThan(25)
  })

  it('keeps the prod reality that most pack sizes are unresolved', () => {
    // cf_known = false dominates, which is why unit prices are mostly
    // incomparable on the price-watch table.
    expect(PRICE_WATCH.filter((r) => !r.cf_known).length).toBeGreaterThan(
      PRICE_WATCH.filter((r) => r.cf_known).length,
    )
  })

  it('keeps the prod reality that the biggest spend sits on stubs with no BOM', () => {
    const top20 = [...ABC_ITEMS]
      .sort((a, b) => b.purchase_thb_8w - a.purchase_thb_8w)
      .slice(0, 20)
    expect(top20.filter((r) => !r.is_canonical)).toHaveLength(18)
    expect(top20.filter((r) => r.has_bom === false)).toHaveLength(18)
  })

  it('preserves the duplicate-supplier and duplicate-item pairs prod has', () => {
    // Deliberately kept: the supplier table and top-20 will show these split,
    // and a future de-duplication should visibly change these tests.
    const suppliers = new Set(PURCHASES.map((r) => r.supplier_name))
    expect(suppliers.has('Sang Damrong Co., Ltd.')).toBe(true)
    expect(suppliers.has('Saeng Damrong Co., Ltd.')).toBe(true)
    expect(suppliers.has('Supercheap Co., Ltd.')).toBe(true)
    expect(suppliers.has('Supercheap Co., Ltd. Branch 0078')).toBe(true)
    // Three lamb stubs at exactly the same price.
    expect(ABC_ITEMS.filter((r) => r.purchase_thb_8w === 485)).toHaveLength(3)
  })
})
