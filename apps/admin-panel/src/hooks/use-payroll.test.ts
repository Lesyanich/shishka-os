import { describe, it, expect } from 'vitest'

describe('usePayroll', () => {
  it('exports usePayroll hook', async () => {
    const mod = await import('./use-payroll')
    expect(mod.usePayroll).toBeDefined()
    expect(typeof mod.usePayroll).toBe('function')
  })
})
