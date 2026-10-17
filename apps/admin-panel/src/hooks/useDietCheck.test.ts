import { describe, it, expect } from 'vitest'

describe('useDietCheck', () => {
  it('exports the hook', async () => {
    const mod = await import('./useDietCheck')
    expect(typeof mod.useDietCheck).toBe('function')
  })
})
