import { describe, it, expect } from 'vitest'

describe('useStaffWarnings', () => {
  it('exports the useStaffWarnings hook', async () => {
    const mod = await import('./useStaffWarnings')
    expect(typeof mod.useStaffWarnings).toBe('function')
  })
})
