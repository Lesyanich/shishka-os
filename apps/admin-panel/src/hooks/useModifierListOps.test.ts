import { describe, it, expect } from 'vitest'
import { useModifierListOps } from './useModifierListOps'

describe('useModifierListOps', () => {
  it('is exported as a function hook', () => {
    expect(typeof useModifierListOps).toBe('function')
  })
})
