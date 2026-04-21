import { describe, it, expect } from 'vitest'

describe('owner/DrawerHero', () => {
  it('exports DrawerHero component', async () => {
    const mod = await import('./DrawerHero')
    expect(mod.DrawerHero).toBeDefined()
    expect(typeof mod.DrawerHero).toBe('function')
  })
})
