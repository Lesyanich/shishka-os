import { describe, it, expect } from 'vitest'

describe('ProcessTab', () => {
  it('exports ProcessTab component', async () => {
    const mod = await import('./ProcessTab')
    expect(mod.ProcessTab).toBeDefined()
    expect(typeof mod.ProcessTab).toBe('function')
  })
})
