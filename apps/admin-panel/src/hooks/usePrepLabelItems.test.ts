import { describe, it, expect } from 'vitest'

describe('usePrepLabelItems', () => {
  it('exports the hook', async () => {
    const mod = await import('./usePrepLabelItems')
    expect(typeof mod.usePrepLabelItems).toBe('function')
  })
})
