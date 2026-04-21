import { describe, it, expect } from 'vitest'

describe('shared/index barrel', () => {
  it('re-exports all primitives', async () => {
    const mod = await import('./index')
    expect(mod.DishCard).toBeDefined()
    expect(mod.NutritionBadges).toBeDefined()
    expect(mod.CBSTags).toBeDefined()
    expect(mod.PriceLabel).toBeDefined()
    expect(mod.CategoryTabs).toBeDefined()
    expect(mod.DishPhotoSlot).toBeDefined()
    expect(mod.foodCostTier).toBeDefined()
    expect(mod.FOOD_COST_THRESHOLDS).toBeDefined()
  })
})
