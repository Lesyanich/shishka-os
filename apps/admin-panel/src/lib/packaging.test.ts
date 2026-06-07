import { describe, it, expect } from 'vitest'
import { NF_PKG_CATEGORY_ID } from './packaging'

describe('packaging', () => {
  it('exposes the NF-PKG category id as a stable UUID', () => {
    expect(NF_PKG_CATEGORY_ID).toBe('db03ad01-c11c-421a-b754-8715f7eef8be')
    // Guards against accidental truncation/format drift.
    expect(NF_PKG_CATEGORY_ID).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
  })
})
