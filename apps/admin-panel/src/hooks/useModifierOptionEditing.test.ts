import { describe, it, expect } from 'vitest'
import { useModifierOptionEditing } from './useModifierOptionEditing'

describe('useModifierOptionEditing', () => {
  it('is exported as a function hook', () => {
    expect(typeof useModifierOptionEditing).toBe('function')
  })
})
