import { describe, it, expect } from 'vitest'
import { costTrustPresentation } from './costTrust'
import type { DishCostTrust } from './costTrust'

describe('shared/CostTrustBadge', () => {
  it('exports CostTrustBadge component', async () => {
    const mod = await import('./CostTrustBadge')
    expect(mod.CostTrustBadge).toBeDefined()
    expect(typeof mod.CostTrustBadge).toBe('function')
  })

  // The badge renders nothing at all when the view has not answered yet, so a
  // slow query never paints a provenance claim the data does not support.
  it('has nothing to render without a trust row', () => {
    expect(costTrustPresentation(null)).toBeNull()
  })

  it('renders a labelled badge for a classified dish', () => {
    const p = costTrustPresentation({
      trust_class: 'verified',
      ingredient_count: 1,
    } as DishCostTrust)
    expect(p?.label).toBe('verified')
    expect(p?.className).toContain('text-[color:var(--color-forest-soft)]')
  })
})
