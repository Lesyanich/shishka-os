import { describe, it, expect } from 'vitest'

describe('HandbookLayout', () => {
  it('exports the HandbookLayout component', async () => {
    const mod = await import('./HandbookLayout')
    expect(typeof mod.HandbookLayout).toBe('function')
  })
})
