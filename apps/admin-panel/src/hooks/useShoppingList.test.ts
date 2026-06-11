import { describe, it, expect } from 'vitest'

describe('useShoppingList', () => {
  it('module exports the hook', async () => {
    const mod = await import('./useShoppingList')
    expect(typeof mod.useShoppingList).toBe('function')
  })
})
