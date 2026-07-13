import { describe, it, expect } from 'vitest'

describe('ProcessTab', () => {
  it('exports the ProcessTab component', async () => {
    const mod = await import('./ProcessTab')
    expect(typeof mod.ProcessTab).toBe('function')
  })
})
