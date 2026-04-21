import { describe, it, expect } from 'vitest'

describe('owner/DrawerBomTree', () => {
  it('exports DrawerBomTree component', async () => {
    const mod = await import('./DrawerBomTree')
    expect(mod.DrawerBomTree).toBeDefined()
    expect(typeof mod.DrawerBomTree).toBe('function')
  })
})
