import { describe, it, expect } from 'vitest'

describe('shared/NutritionBadges', () => {
  it('exports NutritionBadge + NutritionBadges components', async () => {
    const mod = await import('./NutritionBadges')
    expect(mod.NutritionBadge).toBeDefined()
    expect(mod.NutritionBadges).toBeDefined()
    expect(typeof mod.NutritionBadge).toBe('function')
    expect(typeof mod.NutritionBadges).toBe('function')
  })
})
