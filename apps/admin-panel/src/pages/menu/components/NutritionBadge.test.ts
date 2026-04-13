import { describe, it, expect } from 'vitest'

describe('NutritionBadge', () => {
  it('exports NutritionBadge and NutritionBadges', async () => {
    const mod = await import('./NutritionBadge')
    expect(mod.NutritionBadge).toBeDefined()
    expect(mod.NutritionBadges).toBeDefined()
  })
})
