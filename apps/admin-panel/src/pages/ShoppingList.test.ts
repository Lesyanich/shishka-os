import { describe, it, expect } from 'vitest'

describe('ShoppingList', () => {
  it('module exports ShoppingList', async () => {
    const mod = await import('./ShoppingList')
    expect(mod.ShoppingList).toBeDefined()
  })
})
