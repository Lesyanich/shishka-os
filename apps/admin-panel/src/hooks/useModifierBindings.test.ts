import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  },
}))

describe('useModifierBindings', () => {
  it('is exported as a function (custom hook)', async () => {
    const mod = await import('./useModifierBindings')
    expect(typeof mod.useModifierBindings).toBe('function')
  })
})
