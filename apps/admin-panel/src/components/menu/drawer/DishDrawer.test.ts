import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: () => Promise.resolve({ data: null, error: null }),
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({ data: null, error: null }),
          order: () => Promise.resolve({ data: [], error: null }),
        }),
        in: () => Promise.resolve({ data: [], error: null }),
        order: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
  },
}))

describe('DishDrawer', () => {
  it('exports DishDrawer component', async () => {
    const mod = await import('./DishDrawer')
    expect(mod.DishDrawer).toBeDefined()
    expect(typeof mod.DishDrawer).toBe('function')
  })
})
