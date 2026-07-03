import { describe, it, expect } from 'vitest'

describe('HandbookHome', () => {
  it('exports the HandbookHome component', async () => {
    const mod = await import('./HandbookHome')
    expect(typeof mod.HandbookHome).toBe('function')
  })
})
