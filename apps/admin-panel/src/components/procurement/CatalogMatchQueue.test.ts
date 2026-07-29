import { describe, it, expect } from 'vitest'
import { visibleSuggestions, isConfident, fmtPrice } from './CatalogMatchQueue'
import type { MatchSuggestion } from '../../types/catalogMatch'

const s = (item_name: string, score: number): MatchSuggestion => ({
  nomenclature_id: item_name,
  product_code: `RAW-${item_name.toUpperCase()}`,
  item_name,
  base_unit: 'kg',
  cost_per_unit: 1,
  score,
})

/**
 * These two helpers decide what a human is shown while working through 832
 * rows at speed. A wrong candidate offered next to a right one is how bad
 * links get made, so the filtering is the safety mechanism, not decoration.
 * Scores below are real, measured against prod rows 2026-07-29.
 */
describe('visibleSuggestions', () => {
  it('hides noise instead of ranking it last', () => {
    const out = visibleSuggestions([
      s('Sea Salt (Fine)', 0.17), // "Ovaltine Ovanmalt" scored this
      s('ARO Gouda Cheese Shredded 500 g', 0.697),
      s('ARO Bio 2-Compartment Box', 0.14),
    ])
    expect(out.map((x) => x.item_name)).toEqual(['ARO Gouda Cheese Shredded 500 g'])
  })

  it('puts the strongest candidate first — it is the nearest click', () => {
    const out = visibleSuggestions([
      s('ARO Shredded Edam 500g', 0.6),
      s('ARO Gouda Cheese Shredded 500 g', 0.697),
      s('ARO Emmental Cheese Shredded 500 g', 0.622),
    ])
    expect(out.map((x) => x.score)).toEqual([0.697, 0.622, 0.6])
  })

  it('returns nothing when every candidate is noise, so the UI can say so', () => {
    // This is the normal case for products we genuinely do not stock, and it
    // is what makes the "Not ours" outcome reachable rather than a dead end.
    expect(visibleSuggestions([s('Sea Salt (Fine)', 0.17), s('Iodized Salt', 0.08)])).toEqual([])
  })

  it('does not mutate its input', () => {
    const input = [s('a', 0.4), s('b', 0.9)]
    visibleSuggestions(input)
    expect(input.map((x) => x.item_name)).toEqual(['a', 'b'])
  })
})

describe('isConfident', () => {
  it('accepts an exact repeat and a barcode proof', () => {
    expect(isConfident(s('Chai Dee Paper Bag (No.5)', 1.0))).toBe(true)
  })

  it('refuses a plausible-but-ambiguous name', () => {
    // "ARO Shredded Cheese 500g" could be Gouda, Emmental or Edam — all three
    // exist in nomenclature, so this must never be a one-click accept.
    expect(isConfident(s('ARO Gouda Cheese Shredded 500 g', 0.697))).toBe(false)
  })
})

describe('fmtPrice', () => {
  it('renders an em dash rather than 0 when there is no price', () => {
    expect(fmtPrice(null)).toBe('—')
    expect(fmtPrice(0)).toBe('฿0')
  })
})
