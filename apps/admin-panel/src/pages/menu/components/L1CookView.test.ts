import { describe, it, expect } from 'vitest'

describe('L1CookView', () => {
  it('exports the component', async () => {
    const mod = await import('./L1CookView')
    expect(typeof mod.L1CookView).toBe('function')
  })
})
