import { describe, it, expect } from 'vitest'
import {
  BOM_COVERAGE,
  COUNT_DAY,
  COUNT_DAYS,
  INVENTORY,
  REPLENISHMENT,
  STOCK_STATUS,
  SYNTHETIC_VARIANCE,
  TODAY,
  VARIANCE,
  WASTE,
} from './analytics-stock-prod'

/* Guards on the fixture. These rows are the acceptance evidence for the Stock
   control tab; if the fixture quietly changes, the parity checks built on it
   become meaningless while still passing. */

describe('stock fixture integrity', () => {
  it('carries the row counts read off prod on 2026-10-17', () => {
    expect(INVENTORY).toHaveLength(122)
    expect(COUNT_DAYS).toHaveLength(121)
    expect(BOM_COVERAGE).toHaveLength(8)
    expect(REPLENISHMENT).toHaveLength(1)
  })

  it('keeps variance and waste EMPTY, because prod is', () => {
    // The whole point of this phase: the hero table has no data yet, and the
    // tab must explain that rather than hide it.
    expect(VARIANCE).toEqual([])
    expect(WASTE).toEqual([])
    expect(STOCK_STATUS).toEqual([])
  })

  it('has exactly one count day, which is why no interval exists', () => {
    expect(new Set(COUNT_DAYS.map((r) => r.count_day)).size).toBe(1)
    expect(COUNT_DAY).toBe('2026-09-01')
  })

  it('is anchored to a frozen today', () => {
    expect(TODAY).toBe('2026-10-17')
    expect(INVENTORY.every((r) => r.counted_on === COUNT_DAY)).toBe(true)
    expect(INVENTORY.every((r) => r.days_since_count === 46)).toBe(true)
  })

  it('preserves the prod reality that some stock has no cost on file', () => {
    const held = INVENTORY.filter((r) => r.counted_qty > 0 && !r.cost_per_unit)
    expect(held).toHaveLength(14)
  })

  it('preserves the two lines counted as genuinely empty', () => {
    expect(INVENTORY.filter((r) => r.counted_qty === 0)).toHaveLength(2)
  })

  it('preserves the stub lines holding real value', () => {
    const stubs = INVENTORY.filter((r) => !r.is_canonical)
    expect(stubs).toHaveLength(4)
    expect(stubs.reduce((s, r) => s + r.value_thb, 0)).toBeCloseTo(1_951.90, 2)
  })

  it('keeps the four locations prod counted', () => {
    expect(new Set(INVENTORY.map((r) => r.location_name))).toEqual(
      new Set(['Fridge', 'Bar', 'Freezer', 'Chocolate Counter']),
    )
  })

  it('marks the synthetic interval as what it is', () => {
    // Not prod data: it exists so the variance arithmetic is tested early.
    expect(SYNTHETIC_VARIANCE).toHaveLength(4)
    expect(new Set(SYNTHETIC_VARIANCE.map((r) => r.closing_day))).toEqual(new Set(['2026-09-08']))
    // One row is deliberately incomplete, to prove it gets excluded.
    expect(SYNTHETIC_VARIANCE.filter((r) => !r.is_complete)).toHaveLength(1)
  })
})
