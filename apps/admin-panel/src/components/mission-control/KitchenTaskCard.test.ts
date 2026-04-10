import { describe, it, expect } from 'vitest'
describe('KitchenTaskCard', () => {
  it('module exports KitchenTaskCard', async () => {
    const mod = await import('./KitchenTaskCard')
    expect(mod.KitchenTaskCard).toBeDefined()
  })
})
