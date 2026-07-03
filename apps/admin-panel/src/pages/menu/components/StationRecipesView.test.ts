import { describe, it, expect, vi } from 'vitest'

// StationRecipesView renders RecipeStationPanel, which pulls in L1CookView /
// L2AssemblerView, which import the supabase singleton — stub it so the
// module graph loads in isolation.
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

describe('StationRecipesView', () => {
  it('exports the StationRecipesView component', async () => {
    const mod = await import('./StationRecipesView')
    expect(mod.StationRecipesView).toBeDefined()
    expect(typeof mod.StationRecipesView).toBe('function')
  })
})
