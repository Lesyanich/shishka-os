import { describe, it, expect } from 'vitest'
import { useHolidays } from './useHolidays'

describe('useHolidays', () => {
  it('is a hook function', () => {
    expect(typeof useHolidays).toBe('function')
  })
})
