import { describe, it, expect } from 'vitest'

describe('HRLayout', () => {
  it('exports HRLayout component', async () => {
    const mod = await import('./HRLayout')
    expect(mod.HRLayout).toBeDefined()
    expect(typeof mod.HRLayout).toBe('function')
  })
})
