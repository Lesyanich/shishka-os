import { describe, it, expect } from 'vitest'

describe('customer/index barrel', () => {
  it('re-exports HeroHeader, DishGrid, CategorySection', async () => {
    const mod = await import('./index')
    expect(mod.HeroHeader).toBeDefined()
    expect(mod.DishGrid).toBeDefined()
    expect(mod.CategorySection).toBeDefined()
  })
})
