import { describe, it, expect } from 'vitest'
import { PriceBook } from './PriceBook'

// Smoke: import-time guard. Render behaviour is exercised manually via
// /procurement?tab=pricebook (data-driven from v_price_comparison_summary).
describe('PriceBook', () => {
  it('exports a component function', () => {
    expect(typeof PriceBook).toBe('function')
    expect(PriceBook.name).toBe('PriceBook')
  })
})
