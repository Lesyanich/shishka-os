import { describe, it, expect } from 'vitest'

describe('customer/HeroHeader', () => {
  it('exports HeroHeader component', async () => {
    const mod = await import('./HeroHeader')
    expect(mod.HeroHeader).toBeDefined()
    expect(typeof mod.HeroHeader).toBe('function')
  })
})
