import { describe, it, expect } from 'vitest'

describe('useCostTrust', () => {
  it('exports the hook', async () => {
    const mod = await import('./useCostTrust')
    expect(typeof mod.useCostTrust).toBe('function')
  })
})
