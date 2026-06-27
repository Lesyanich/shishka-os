import { describe, it, expect } from 'vitest'
import { StockPanel, fmtQty } from './StockPanel'

describe('StockPanel', () => {
  it('exports a component function', () => {
    expect(typeof StockPanel).toBe('function')
    expect(StockPanel.name).toBe('StockPanel')
  })
})

describe('fmtQty', () => {
  it('appends the unit and keeps integers clean', () => {
    expect(fmtQty(3, 'kg')).toBe('3 kg')
  })
  it('shows two decimals for fractional qty', () => {
    expect(fmtQty(2.5, 'L')).toBe('2.50 L')
  })
  it('handles null and missing unit', () => {
    expect(fmtQty(null, 'kg')).toBe('—')
    expect(fmtQty(4, null)).toBe('4')
  })
})
