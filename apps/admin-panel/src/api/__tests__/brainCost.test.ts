import { describe, it, expect } from 'vitest'

describe('brainCost API', () => {
  it('module exports query functions', async () => {
    const mod = await import('../brainCost')
    expect(mod.fetchRecentQueries).toBeDefined()
    expect(mod.fetchDailyCosts).toBeDefined()
    expect(mod.fetchAgentBreakdown).toBeDefined()
    expect(mod.fetchTotalSpend30d).toBeDefined()
  })
})
