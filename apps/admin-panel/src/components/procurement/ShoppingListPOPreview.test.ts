import { describe, it, expect } from 'vitest'

describe('ShoppingListPOPreview', () => {
  it('module exports ShoppingListPOPreview', async () => {
    const mod = await import('./ShoppingListPOPreview')
    expect(typeof mod.ShoppingListPOPreview).toBe('function')
  })
})
