import { describe, it, expect } from 'vitest'

describe('useWarningProposals', () => {
  it('exports the useWarningProposals hook', async () => {
    const mod = await import('./useWarningProposals')
    expect(typeof mod.useWarningProposals).toBe('function')
  })
})
