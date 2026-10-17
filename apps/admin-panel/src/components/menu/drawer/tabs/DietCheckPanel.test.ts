import { describe, it, expect } from 'vitest'

describe('drawer/tabs/DietCheckPanel', () => {
  it('exports DietCheckPanel component', async () => {
    const mod = await import('./DietCheckPanel')
    expect(typeof mod.DietCheckPanel).toBe('function')
  })
})
