import { describe, it, expect } from 'vitest'

describe('MemPalaceBrowser', () => {
  it('module exports MemPalaceBrowser component', async () => {
    const mod = await import('../MemPalaceBrowser')
    expect(typeof mod.MemPalaceBrowser).toBe('function')
  })
})
