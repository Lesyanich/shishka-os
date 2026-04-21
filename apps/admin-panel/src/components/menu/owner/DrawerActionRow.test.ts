import { describe, it, expect } from 'vitest'

describe('owner/DrawerActionRow', () => {
  it('exports DrawerActionRow component', async () => {
    const mod = await import('./DrawerActionRow')
    expect(mod.DrawerActionRow).toBeDefined()
    expect(typeof mod.DrawerActionRow).toBe('function')
  })
})
