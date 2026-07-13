import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
  },
}))

describe('useComponentRecipeSteps', () => {
  it('exports the useComponentRecipeSteps hook', async () => {
    const mod = await import('./useComponentRecipeSteps')
    expect(typeof mod.useComponentRecipeSteps).toBe('function')
  })
})
