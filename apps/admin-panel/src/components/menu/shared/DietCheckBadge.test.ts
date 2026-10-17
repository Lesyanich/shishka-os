import { describe, it, expect } from 'vitest'

describe('shared/DietCheckBadge', () => {
  it('exports DietCheckBadge component', async () => {
    const mod = await import('./DietCheckBadge')
    expect(typeof mod.DietCheckBadge).toBe('function')
  })
})
