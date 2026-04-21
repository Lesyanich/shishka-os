import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: [], error: null }),
        order: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
      }),
      insert: () => Promise.resolve({ error: null }),
      delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
    }),
  },
}))

describe('useDishTags', () => {
  it('exports useDishTags hook', async () => {
    const mod = await import('./useDishTags')
    expect(mod.useDishTags).toBeDefined()
    expect(typeof mod.useDishTags).toBe('function')
  })
})
