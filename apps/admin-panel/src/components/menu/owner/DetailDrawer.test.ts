import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: () => Promise.resolve({ data: null, error: null }),
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
        in: () => Promise.resolve({ data: [], error: null }),
        order: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
      }),
    }),
  },
}))

describe('owner/DetailDrawer', () => {
  it('exports DetailDrawer component', async () => {
    const mod = await import('./DetailDrawer')
    expect(mod.DetailDrawer).toBeDefined()
    expect(typeof mod.DetailDrawer).toBe('function')
  })
})
