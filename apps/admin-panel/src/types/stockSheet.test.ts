import { describe, it, expect } from 'vitest'
import { STORAGE_LABELS, STORAGE_OPTIONS } from './stockSheet'

describe('stockSheet types', () => {
  it('every storage option has a bilingual label', () => {
    for (const opt of STORAGE_OPTIONS) {
      expect(STORAGE_LABELS[opt]).toBeDefined()
      expect(STORAGE_LABELS[opt].en.length).toBeGreaterThan(0)
      expect(STORAGE_LABELS[opt].th.length).toBeGreaterThan(0)
    }
  })

  it('exposes the four kitchen storage zones', () => {
    expect(STORAGE_OPTIONS).toEqual(['bar', 'dry', 'fridge', 'freezer'])
  })
})
