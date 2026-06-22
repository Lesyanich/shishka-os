import { describe, it, expect } from 'vitest'

describe('useSaleLabelInfo', () => {
  it('exports the hook', async () => {
    const mod = await import('./useSaleLabelInfo')
    expect(typeof mod.useSaleLabelInfo).toBe('function')
  })
})
