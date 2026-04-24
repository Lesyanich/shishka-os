import { describe, expect, it } from 'vitest'

describe('PhaseCard', () => {
  it('exports PhaseCard component', async () => {
    const mod = await import('../PhaseCard')
    expect(typeof mod.PhaseCard).toBe('function')
  })
})
