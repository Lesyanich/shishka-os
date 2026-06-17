import { describe, it, expect, vi } from 'vitest'

// The panel pulls in L1CookView / L2AssemblerView, which import the supabase
// singleton — stub it so the module graph loads in isolation.
vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        or: () => ({ order: () => ({ error: null, data: [] }) }),
        in: () => ({ data: [], error: null }),
        eq: () => ({ order: () => ({ error: null, data: [] }) }),
      }),
    }),
  },
}))

describe('RecipeStationPanel', () => {
  it('exports the RecipeStationPanel component', async () => {
    const mod = await import('./RecipeStationPanel')
    expect(mod.RecipeStationPanel).toBeDefined()
    expect(typeof mod.RecipeStationPanel).toBe('function')
  })
})
