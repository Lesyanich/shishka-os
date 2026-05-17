import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
  },
}))

describe('useDishCard', () => {
  it('exports useDishCard hook', async () => {
    const mod = await import('./useDishCard')
    expect(mod.useDishCard).toBeDefined()
    expect(typeof mod.useDishCard).toBe('function')
  })
})
