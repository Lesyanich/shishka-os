import { describe, it, expect } from 'vitest'

describe('HandbookPage', () => {
  it('exports the HandbookPage component', async () => {
    const mod = await import('./HandbookPage')
    expect(typeof mod.HandbookPage).toBe('function')
  })
})
