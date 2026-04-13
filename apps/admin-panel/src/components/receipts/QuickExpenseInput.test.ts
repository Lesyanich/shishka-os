import { describe, it, expect } from 'vitest'

describe('QuickExpenseInput', () => {
  it('should export QuickExpenseInput component', async () => {
    const mod = await import('./QuickExpenseInput')
    expect(mod.QuickExpenseInput).toBeDefined()
    expect(typeof mod.QuickExpenseInput).toBe('function')
  })
})
