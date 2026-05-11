import { describe, it, expect } from 'vitest'

describe('PayrollPage', () => {
  it('exports PayrollPage component', async () => {
    const mod = await import('./PayrollPage')
    expect(mod.PayrollPage).toBeDefined()
    expect(typeof mod.PayrollPage).toBe('function')
  })
})
