import { describe, it, expect } from 'vitest'

describe('owner/DrawerScorecard', () => {
  it('exports DrawerScorecard component', async () => {
    const mod = await import('./DrawerScorecard')
    expect(mod.DrawerScorecard).toBeDefined()
    expect(typeof mod.DrawerScorecard).toBe('function')
  })
})
