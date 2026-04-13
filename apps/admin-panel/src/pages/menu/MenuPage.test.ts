import { describe, it, expect } from 'vitest'

describe('MenuPage', () => {
  it('exports MenuPage component', async () => {
    const mod = await import('./MenuPage')
    expect(mod.MenuPage).toBeDefined()
    expect(typeof mod.MenuPage).toBe('function')
  })
})
