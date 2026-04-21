import { describe, it, expect } from 'vitest'

describe('customer/DishGrid', () => {
  it('exports DishGrid component', async () => {
    const mod = await import('./DishGrid')
    expect(mod.DishGrid).toBeDefined()
    expect(typeof mod.DishGrid).toBe('function')
  })
})
