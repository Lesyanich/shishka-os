import { describe, it, expect } from 'vitest'
import { useDishModifierGroups } from './useDishModifierGroups'

describe('useDishModifierGroups', () => {
  it('is exported as a function hook', () => {
    expect(typeof useDishModifierGroups).toBe('function')
  })
})
