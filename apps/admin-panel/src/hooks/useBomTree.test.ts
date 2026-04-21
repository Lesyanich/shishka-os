import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
        in: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  },
}))

describe('useBomTree', () => {
  it('exports useBomTree hook', async () => {
    const mod = await import('./useBomTree')
    expect(mod.useBomTree).toBeDefined()
    expect(typeof mod.useBomTree).toBe('function')
  })
})
