import { describe, it, expect } from 'vitest'
import { useModifierSync } from './useModifierSync'

describe('useModifierSync', () => {
  it('is exported as a function hook', () => {
    expect(typeof useModifierSync).toBe('function')
  })
})
