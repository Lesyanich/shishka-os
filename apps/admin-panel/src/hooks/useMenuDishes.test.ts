import { describe, it, expect } from 'vitest'

describe('useMenuDishes', () => {
  it('exports useMenuDishes hook', async () => {
    const mod = await import('./useMenuDishes')
    expect(mod.useMenuDishes).toBeDefined()
    expect(typeof mod.useMenuDishes).toBe('function')
  })
})
