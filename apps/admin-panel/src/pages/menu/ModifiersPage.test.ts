import { describe, it, expect, vi } from 'vitest'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  },
}))

describe('ModifiersPage', () => {
  it('is exported as a function component', async () => {
    const mod = await import('./ModifiersPage')
    expect(typeof mod.ModifiersPage).toBe('function')
  })
})
