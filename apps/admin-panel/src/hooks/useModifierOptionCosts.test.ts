import { describe, it, expect } from 'vitest'
import { useModifierOptionCosts } from './useModifierOptionCosts'

describe('useModifierOptionCosts', () => {
  it('is exported as a function hook', () => {
    expect(typeof useModifierOptionCosts).toBe('function')
  })
})
