import { describe, it, expect } from 'vitest'
import { costTrustPresentation, isCostUntrustworthy } from './costTrust'
import type { DishCostTrust, DishTrustClass } from './costTrust'

function trust(over: Partial<DishCostTrust> & { trust_class: DishTrustClass }): DishCostTrust {
  return {
    dish_id: 'd1',
    product_code: 'SALE-TEST',
    trust_rank: 0,
    ingredient_count: 10,
    zero_cost_count: 0,
    deleted_count: 0,
    unverified_count: 0,
    estimated_count: 0,
    manual_count: 0,
    verified_count: 10,
    has_deleted_ingredient: false,
    worst_ingredient_name: null,
    worst_ingredient_code: null,
    worst_ingredient_reason: null,
    worst_ingredient_cost: null,
    worst_ingredient_history_cost: null,
    worst_ingredient_divergence: null,
    ...over,
  }
}

describe('costTrustPresentation', () => {
  it('renders nothing when trust is unknown (view still loading)', () => {
    expect(costTrustPresentation(null)).toBeNull()
    expect(costTrustPresentation(undefined)).toBeNull()
  })

  it('gives every class a text label — colour is never the only signal', () => {
    const classes: DishTrustClass[] = [
      'no_bom', 'no_cost', 'deleted', 'unverified', 'estimated', 'manual', 'verified',
    ]
    for (const c of classes) {
      const p = costTrustPresentation(trust({ trust_class: c }))
      expect(p, c).not.toBeNull()
      expect(p!.label.length, c).toBeGreaterThan(0)
      expect(p!.title.length, c).toBeGreaterThan(0)
      expect(p!.detail.length, c).toBeGreaterThan(0)
    }
  })

  it('keeps the original ~est wording for catalog estimates', () => {
    const p = costTrustPresentation(trust({ trust_class: 'estimated', estimated_count: 2 }))
    expect(p!.label).toBe('~est')
    expect(p!.title).toMatch(/Makro catalog/)
  })

  it('names the ingredient that caused the class, so the tooltip can point at it', () => {
    const p = costTrustPresentation(
      trust({
        trust_class: 'unverified',
        unverified_count: 3,
        worst_ingredient_name: 'Olive Oil (Extra Virgin)',
      }),
    )
    expect(p!.title).toContain('Olive Oil (Extra Virgin)')
    expect(p!.detail).toContain('3 of 10')
  })

  it('falls back to a generic phrase when no ingredient name came back', () => {
    const p = costTrustPresentation(trust({ trust_class: 'unverified' }))
    expect(p!.title).toContain('one of its ingredients')
  })

  // The audit found the STORED cost is often the trustworthy one (a 100 g pack
  // booked as 1 kg corrupts purchase_logs, not nomenclature). The copy must read
  // as uncertainty, never as a verdict against the number on screen.
  it('phrases a divergence as uncertainty, not as an accusation', () => {
    const p = costTrustPresentation(
      trust({
        trust_class: 'unverified',
        worst_ingredient_name: 'Olive Oil (Extra Virgin)',
        worst_ingredient_cost: 440,
        worst_ingredient_history_cost: 2400.5,
      }),
    )
    expect(p!.title).toMatch(/one of the two is wrong/i)
    expect(p!.title).toMatch(/฿440/)
    expect(p!.title).toMatch(/฿2,401|฿2,400/)
    // No verdict against the displayed figure.
    expect(p!.title).not.toMatch(/\bthis cost is wrong\b|\bincorrect\b|\bfabricated\b/i)
  })

  it('omits the two numbers when only one side is known', () => {
    const p = costTrustPresentation(
      trust({ trust_class: 'unverified', worst_ingredient_cost: 440 }),
    )
    expect(p!.title).not.toMatch(/one of the two is wrong/i)
  })

  it('says the real cost is higher when an ingredient has no cost', () => {
    const p = costTrustPresentation(
      trust({
        trust_class: 'no_cost',
        zero_cost_count: 4,
        ingredient_count: 32,
        worst_ingredient_name: 'Garlic Powder',
      }),
    )
    expect(p!.label).toBe('cost missing')
    expect(p!.title).toContain('Garlic Powder')
    expect(p!.detail).toMatch(/higher than the figure/i)
  })

  it('tells the owner a no-BOM margin is not a measurement', () => {
    const p = costTrustPresentation(trust({ trust_class: 'no_bom', ingredient_count: 0 }))
    expect(p!.title).toMatch(/not a measurement/i)
  })

  it('singularises the verified tooltip for a one-ingredient dish', () => {
    const one = costTrustPresentation(
      trust({ trust_class: 'verified', ingredient_count: 1, verified_count: 1 }),
    )
    expect(one!.title).toMatch(/1 ingredient checked/)
    const many = costTrustPresentation(trust({ trust_class: 'verified' }))
    expect(many!.title).toMatch(/10 ingredients checked/)
  })
})

describe('isCostUntrustworthy', () => {
  // Only the classes where the FIGURE itself understates or invents the cost
  // earn the red treatment; uncertainty is amber, not red.
  it('is true when the cost is missing or uncalculated', () => {
    expect(isCostUntrustworthy(trust({ trust_class: 'no_bom' }))).toBe(true)
    expect(isCostUntrustworthy(trust({ trust_class: 'no_cost' }))).toBe(true)
  })

  it('is false for uncertainty, estimates, hand-set and verified costs', () => {
    expect(isCostUntrustworthy(trust({ trust_class: 'unverified' }))).toBe(false)
    expect(isCostUntrustworthy(trust({ trust_class: 'estimated' }))).toBe(false)
    expect(isCostUntrustworthy(trust({ trust_class: 'manual' }))).toBe(false)
    expect(isCostUntrustworthy(trust({ trust_class: 'deleted' }))).toBe(false)
    expect(isCostUntrustworthy(trust({ trust_class: 'verified' }))).toBe(false)
  })

  it('is false when trust is unknown', () => {
    expect(isCostUntrustworthy(null)).toBe(false)
  })
})
