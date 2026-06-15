import { describe, it, expect } from 'vitest'

describe('usePrepBatches', () => {
  it('exports the hook', async () => {
    const mod = await import('./usePrepBatches')
    expect(typeof mod.usePrepBatches).toBe('function')
  })
})
