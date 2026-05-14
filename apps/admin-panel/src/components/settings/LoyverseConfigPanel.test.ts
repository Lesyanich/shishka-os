import { describe, it, expect } from 'vitest'

describe('LoyverseConfigPanel', () => {
  it('exports LoyverseConfigPanel component', async () => {
    const mod = await import('./LoyverseConfigPanel')
    expect(mod.LoyverseConfigPanel).toBeDefined()
    expect(typeof mod.LoyverseConfigPanel).toBe('function')
  })
})
