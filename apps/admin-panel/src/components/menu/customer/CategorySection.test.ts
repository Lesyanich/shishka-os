import { describe, it, expect } from 'vitest'

describe('customer/CategorySection', () => {
  it('exports CategorySection component', async () => {
    const mod = await import('./CategorySection')
    expect(mod.CategorySection).toBeDefined()
    expect(typeof mod.CategorySection).toBe('function')
  })
})
