import { describe, it, expect } from 'vitest'

describe('QuickAddForm', () => {
  it('module exports QuickAddForm', async () => {
    const mod = await import('./QuickAddForm')
    expect(mod.QuickAddForm).toBeDefined()
  })
})
