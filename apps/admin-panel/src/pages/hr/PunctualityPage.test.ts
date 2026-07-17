import { describe, it, expect } from 'vitest'

describe('PunctualityPage', () => {
  it('exports the PunctualityPage component', async () => {
    const mod = await import('./PunctualityPage')
    expect(typeof mod.PunctualityPage).toBe('function')
    expect(mod.default).toBe(mod.PunctualityPage)
  })
})
