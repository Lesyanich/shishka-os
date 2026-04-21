import { describe, it, expect } from 'vitest'

describe('owner/DrawerTagEditor', () => {
  it('exports DrawerTagEditor component', async () => {
    const mod = await import('./DrawerTagEditor')
    expect(mod.DrawerTagEditor).toBeDefined()
    expect(typeof mod.DrawerTagEditor).toBe('function')
  })
})
