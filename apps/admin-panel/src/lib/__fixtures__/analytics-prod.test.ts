import { describe, it, expect } from 'vitest'
import { HEAT, ITEMS, SALES, TODAY, PERIOD_START } from './analytics-prod'
import { mondayOf } from '../analytics'

/* Guards on the fixture itself. These rows are the acceptance evidence for
   /analytics; if the fixture quietly loses or gains rows, every parity check
   built on it becomes meaningless while still passing. */

describe('prod fixture integrity', () => {
  it('carries the row counts read off prod on 2026-10-16', () => {
    expect(SALES).toHaveLength(40)
    expect(ITEMS).toHaveLength(222)
    expect(HEAT).toHaveLength(90)
  })

  it('has no modifier sales lines, matching prod', () => {
    // Prod: v_analytics_item_sales_daily has 0 rows with is_modifier = true.
    // Modifier INGREDIENT deductions do exist (110 stock_movements rows), but
    // the POS emits no modifier SALES line. The exclusion logic is pinned with
    // synthetic rows in analytics.test.ts, since there is nothing here to drop.
    expect(ITEMS.every((r) => !r.is_modifier)).toBe(true)
  })

  it('buckets every week to the Monday the views bucket to', () => {
    for (const row of SALES) expect(row.week).toBe(mondayOf(row.day))
    for (const row of HEAT) expect(mondayOf(row.week)).toBe(row.week)
  })

  it('is anchored to a frozen today, so incoming sales cannot drift it', () => {
    expect(TODAY).toBe('2026-10-16')
    expect(PERIOD_START).toBe('2026-09-21')
    expect(SALES.every((r) => r.day <= TODAY)).toBe(true)
  })

  it('gives the heatmap an inverted revenue, so a receipts/revenue swap fails loudly', () => {
    // The quietest cells carry the highest revenue by construction.
    const busiest = HEAT.reduce((a, b) => (a.receipts > b.receipts ? a : b))
    const richest = HEAT.reduce((a, b) => (a.revenue > b.revenue ? a : b))
    expect(busiest.receipts).toBeGreaterThan(richest.receipts)
  })
})
