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

describe('parseStationAvailable', () => {
  it('defaults both stations to Active-only when the param is absent', async () => {
    const { parseStationAvailable } = await import('./StationRecipesView')
    expect(parseStationAvailable(null)).toBe(true)
  })

  it('treats an unknown value as the default', async () => {
    const { parseStationAvailable } = await import('./StationRecipesView')
    expect(parseStationAvailable('maybe')).toBe(true)
  })

  it('all = no filter, no = inactive-only, yes = back-compat Active', async () => {
    const { parseStationAvailable } = await import('./StationRecipesView')
    expect(parseStationAvailable('all')).toBeNull()
    expect(parseStationAvailable('no')).toBe(false)
    expect(parseStationAvailable('yes')).toBe(true)
  })
})

describe('serializeStationAvailable', () => {
  it('omits the param for the Active default and round-trips the rest', async () => {
    const { parseStationAvailable, serializeStationAvailable } = await import('./StationRecipesView')
    expect(serializeStationAvailable(true)).toBeNull()
    expect(serializeStationAvailable(false)).toBe('no')
    expect(serializeStationAvailable(null)).toBe('all')
    for (const v of [true, false, null] as const) {
      expect(parseStationAvailable(serializeStationAvailable(v))).toBe(v)
    }
  })
})
