import { describe, it, expect } from 'vitest'

describe('CostChart', () => {
  it('module exports CostChart component', async () => {
    const mod = await import('../CostChart')
    expect(mod.CostChart).toBeDefined()
  })
})
