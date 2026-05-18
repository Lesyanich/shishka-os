import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
    from: () => ({
      select: () => ({
        like: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
  },
}))

describe('AddBindingForm', () => {
  it('is exported as a function component', async () => {
    const mod = await import('./AddBindingForm')
    expect(typeof mod.AddBindingForm).toBe('function')
  })
})
