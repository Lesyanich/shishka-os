import { describe, it, expect } from 'vitest'
import { classifyShelfKind } from './useShelfLifeItems'

describe('classifyShelfKind', () => {
  it('classifies PF and SALE codes', () => {
    expect(classifyShelfKind('PF-CHICKEN_SV')).toBe('PF')
    expect(classifyShelfKind('SALE-SUMMER_ROLL')).toBe('SALE')
  })
  it('returns null for RAW / MOD / packaging', () => {
    expect(classifyShelfKind('RAW-CHICKEN')).toBeNull()
    expect(classifyShelfKind('MOD-EXTRA')).toBeNull()
    expect(classifyShelfKind('NF-PKG-CUP')).toBeNull()
  })
})
