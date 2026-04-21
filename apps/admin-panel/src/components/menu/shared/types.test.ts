import { describe, it, expect } from 'vitest'
import { FOOD_COST_THRESHOLDS, foodCostTier } from './types'

describe('shared/types · foodCostTier', () => {
  it('exports FOOD_COST_THRESHOLDS with good=30 warn=45', () => {
    expect(FOOD_COST_THRESHOLDS.good).toBe(30)
    expect(FOOD_COST_THRESHOLDS.warn).toBe(45)
  })
  it('classifies tiers by threshold', () => {
    expect(foodCostTier(25)).toBe('good')
    expect(foodCostTier(29.99)).toBe('good')
    expect(foodCostTier(30)).toBe('warn')
    expect(foodCostTier(45)).toBe('warn')
    expect(foodCostTier(45.01)).toBe('bad')
    expect(foodCostTier(60)).toBe('bad')
  })
})
