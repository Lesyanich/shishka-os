import { describe, it, expect } from 'vitest'

describe('BrainCostPage', () => {
  it('module exports BrainCostPage component', async () => {
    const mod = await import('../BrainCostPage')
    expect(mod.BrainCostPage).toBeDefined()
  })
})
