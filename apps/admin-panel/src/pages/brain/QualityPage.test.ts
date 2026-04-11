import { describe, it, expect } from 'vitest'

describe('QualityPage', () => {
  it('module exports QualityPage component', async () => {
    const mod = await import('./QualityPage')
    expect(mod.QualityPage).toBeDefined()
    expect(typeof mod.QualityPage).toBe('function')
  })
})
