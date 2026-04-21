import { describe, it, expect } from 'vitest'

describe('shared/CategoryTabs', () => {
  it('exports CategoryTabs component', async () => {
    const mod = await import('./CategoryTabs')
    expect(mod.CategoryTabs).toBeDefined()
    expect(typeof mod.CategoryTabs).toBe('function')
  })
})
