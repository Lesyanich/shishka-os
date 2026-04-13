import { describe, it, expect } from 'vitest'

describe('DishCard', () => {
  it('exports DishCard component', async () => {
    const mod = await import('./DishCard')
    expect(mod.DishCard).toBeDefined()
    expect(typeof mod.DishCard).toBe('function')
  })
})
