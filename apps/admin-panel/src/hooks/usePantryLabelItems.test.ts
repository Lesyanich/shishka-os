import { describe, it, expect } from 'vitest'
import { usePantryLabelItems, PANTRY_LABEL_TAG } from './usePantryLabelItems'

describe('usePantryLabelItems', () => {
  it('exports the hook', () => {
    expect(typeof usePantryLabelItems).toBe('function')
  })

  it('curates the pantry tab by the pantry-label ops tag', () => {
    // The tab is driven by this tag (seeded by migration 334); the slug must
    // stay in sync with the DB tag or the "Jars & Bottles" list goes empty.
    expect(PANTRY_LABEL_TAG).toBe('pantry-label')
  })
})
