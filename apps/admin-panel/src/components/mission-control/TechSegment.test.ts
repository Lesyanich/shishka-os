import { describe, it, expect } from 'vitest'
describe('TechSegment', () => {
  it('module exports TechSegment', async () => {
    const mod = await import('./TechSegment')
    expect(mod.TechSegment).toBeDefined()
  })
})
