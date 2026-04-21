import { describe, it, expect } from 'vitest'

describe('shared/PriceLabel', () => {
  it('exports PriceLabel component', async () => {
    const mod = await import('./PriceLabel')
    expect(mod.PriceLabel).toBeDefined()
    expect(typeof mod.PriceLabel).toBe('function')
  })
})
