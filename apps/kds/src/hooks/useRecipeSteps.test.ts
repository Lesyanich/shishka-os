import { describe, it, expect } from 'vitest'

describe('useRecipeSteps', () => {
  it('exports useRecipeSteps hook', async () => {
    const mod = await import('./useRecipeSteps')
    expect(mod.useRecipeSteps).toBeDefined()
  })
})
