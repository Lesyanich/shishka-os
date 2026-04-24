import { describe, expect, it } from 'vitest'
import { DAY_1_CATEGORIES, readinessSummary } from '../dishes-config'

describe('dishes-config', () => {
  it('exports categories and readiness helper', () => {
    expect(Array.isArray(DAY_1_CATEGORIES)).toBe(true)
    expect(typeof readinessSummary).toBe('function')
  })
})
