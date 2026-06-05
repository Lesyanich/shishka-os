import { describe, it, expect } from 'vitest'

describe('ShoppingListTable', () => {
  it('module exports ShoppingListTable', async () => {
    const mod = await import('./ShoppingListTable')
    expect(mod.ShoppingListTable).toBeDefined()
  })
})
