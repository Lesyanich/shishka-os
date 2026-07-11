import { describe, it, expect } from 'vitest'

describe('PlayPage', () => {
  it('exports a default component', async () => {
    const mod = await import('./PlayPage')
    expect(mod.default).toBeDefined()
    expect(typeof mod.default).toBe('function')
  })
})
