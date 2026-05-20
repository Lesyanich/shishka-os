import { describe, it, expect } from 'vitest'

describe('useBomIngredients', () => {
  it('exports useBomIngredients hook', async () => {
    const mod = await import('./useBomIngredients')
    expect(mod.useBomIngredients).toBeDefined()
  })
})
