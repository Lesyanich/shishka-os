import { describe, it, expect } from 'vitest'

describe('useHACCP', () => {
  it('exports useHACCP hook', async () => {
    const mod = await import('./useHACCP')
    expect(mod.useHACCP).toBeDefined()
  })
})
