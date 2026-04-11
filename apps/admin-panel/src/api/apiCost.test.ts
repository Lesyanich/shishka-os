import { describe, it, expect } from 'vitest'
import { fetchRecentApiCosts, fetchTotalSpend30d, fetchDailyCosts, fetchModelBreakdown } from './apiCost'

describe('apiCost', () => {
  it('exports fetchRecentApiCosts', () => {
    expect(typeof fetchRecentApiCosts).toBe('function')
  })
  it('exports fetchTotalSpend30d', () => {
    expect(typeof fetchTotalSpend30d).toBe('function')
  })
  it('exports fetchDailyCosts', () => {
    expect(typeof fetchDailyCosts).toBe('function')
  })
  it('exports fetchModelBreakdown', () => {
    expect(typeof fetchModelBreakdown).toBe('function')
  })
})
