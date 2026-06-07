import { describe, it, expect } from 'vitest'
import { NF_PKG_CODE_PREFIX, isPackagingCategoryCode } from './packaging'

describe('packaging', () => {
  it('exposes the NF-PKG category code prefix', () => {
    expect(NF_PKG_CODE_PREFIX).toBe('NF-PKG')
  })

  it('matches the whole NF-PKG subtree by code prefix', () => {
    // parent + all known children
    expect(isPackagingCategoryCode('NF-PKG')).toBe(true)
    expect(isPackagingCategoryCode('NF-PKG-CNT')).toBe(true)
    expect(isPackagingCategoryCode('NF-PKG-BAG')).toBe(true)
    expect(isPackagingCategoryCode('NF-PKG-CTL')).toBe(true)
    // non-packaging
    expect(isPackagingCategoryCode('KP-FIN-SLD')).toBe(false)
    expect(isPackagingCategoryCode('NF-CLN')).toBe(false)
    expect(isPackagingCategoryCode(null)).toBe(false)
    expect(isPackagingCategoryCode(undefined)).toBe(false)
  })
})
