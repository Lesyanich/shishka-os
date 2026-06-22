import { describe, it, expect } from 'vitest'

describe('useAllPrepBatches', () => {
  it('exports the hook', async () => {
    const mod = await import('./useAllPrepBatches')
    expect(typeof mod.useAllPrepBatches).toBe('function')
  })
})
