import { describe, it, expect } from 'vitest'
import { PriceBookTable } from './PriceBookTable'

// Smoke: import-time guard for the hand-rolled comparison table.
describe('PriceBookTable', () => {
  it('exports a component function', () => {
    expect(typeof PriceBookTable).toBe('function')
    expect(PriceBookTable.name).toBe('PriceBookTable')
  })
})
