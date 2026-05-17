import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
  },
}))

describe('useDishRecipeSteps', () => {
  it('exports useDishRecipeSteps hook', async () => {
    const mod = await import('./useDishRecipeSteps')
    expect(mod.useDishRecipeSteps).toBeDefined()
    expect(typeof mod.useDishRecipeSteps).toBe('function')
  })
})
