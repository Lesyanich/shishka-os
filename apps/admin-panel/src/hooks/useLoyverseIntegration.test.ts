import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
    from: () => ({
      select: () => ({
        order: () => ({
          limit: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
  },
}))

describe('useLoyverseIntegration', () => {
  it('exports useLoyverseIntegration hook', async () => {
    const mod = await import('./useLoyverseIntegration')
    expect(mod.useLoyverseIntegration).toBeDefined()
    expect(typeof mod.useLoyverseIntegration).toBe('function')
  })
})
