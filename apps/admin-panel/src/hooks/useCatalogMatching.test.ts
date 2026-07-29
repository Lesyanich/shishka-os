import { describe, it, expect } from 'vitest'
import { CONFIDENT_MATCH, USABLE_MATCH } from './useCatalogMatching'

/**
 * The thresholds are the whole safety story of the matching queue: too low and
 * it invites a wrong link, too high and nothing is ever suggested. They are
 * calibrated against real trigram scores measured on prod orphans, so these
 * tests pin the calibration rather than the arithmetic.
 */
describe('catalog match thresholds', () => {
  it('orders the two bands and keeps both inside 0..1', () => {
    expect(USABLE_MATCH).toBeGreaterThan(0)
    expect(USABLE_MATCH).toBeLessThan(CONFIDENT_MATCH)
    expect(CONFIDENT_MATCH).toBeLessThanOrEqual(1)
  })

  // Scores below are real, measured on prod rows 2026-07-29.
  const measured = {
    exactRepeat: 1.0, // "Chai Dee Paper Bag (No.5) ..." -> same string
    barcodeProof: 1.0, // shared barcode, scored as proof by fn_suggest_catalog_matches
    sameProductDifferentWording: 0.697, // "ARO Shredded Cheese 500g" -> "ARO Gouda Cheese Shredded 500 g"
    relatedCategory: 0.63, // "Lemon Turbo Dishwashing Liquid" -> "Dishwashing Liquid"
    unrelated: 0.17, // "Ovaltine Ovanmalt" -> "Sea Salt (Fine)"
    veryUnrelated: 0.14, // "Biovitt Collagen Complex" -> "ARO Bio 2-Compartment Box"
  }

  it('treats only effectively-identical names as one-click confident', () => {
    expect(measured.exactRepeat).toBeGreaterThanOrEqual(CONFIDENT_MATCH)
    expect(measured.barcodeProof).toBeGreaterThanOrEqual(CONFIDENT_MATCH)
    // A plausible-but-not-certain pair must NOT be one-click: "ARO Shredded
    // Cheese" could be Gouda, Emmental or Edam, and all three exist.
    expect(measured.sameProductDifferentWording).toBeLessThan(CONFIDENT_MATCH)
  })

  it('suggests plausible pairs but hides noise', () => {
    expect(measured.sameProductDifferentWording).toBeGreaterThanOrEqual(USABLE_MATCH)
    expect(measured.relatedCategory).toBeGreaterThanOrEqual(USABLE_MATCH)
    // Showing these would invite a wrong link on a screen built for speed.
    expect(measured.unrelated).toBeLessThan(USABLE_MATCH)
    expect(measured.veryUnrelated).toBeLessThan(USABLE_MATCH)
  })
})
