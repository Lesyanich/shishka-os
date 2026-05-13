import { describe, it, expect } from 'vitest'

describe('KitchenLogin', () => {
  it('exports KitchenLogin component', async () => {
    const mod = await import('./KitchenLogin')
    expect(typeof mod.KitchenLogin).toBe('function')
    expect(typeof mod.default).toBe('function')
  })
})
