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

describe('usePfPackCard', () => {
  it('exports usePfPackCard hook', async () => {
    const mod = await import('./usePfPackCard')
    expect(mod.usePfPackCard).toBeDefined()
    expect(typeof mod.usePfPackCard).toBe('function')
  })
})
