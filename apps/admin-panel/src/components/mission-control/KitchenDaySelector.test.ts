import { describe, it, expect } from 'vitest'
describe('KitchenDaySelector', () => {
  it('module exports KitchenDaySelector', async () => {
    const mod = await import('./KitchenDaySelector')
    expect(mod.KitchenDaySelector).toBeDefined()
  })
})
