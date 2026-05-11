import { describe, it, expect } from 'vitest'

describe('useStaffCards', () => {
  it('exports useStaffCards hook', async () => {
    const mod = await import('./use-staff-cards')
    expect(mod.useStaffCards).toBeDefined()
    expect(typeof mod.useStaffCards).toBe('function')
  })
})
