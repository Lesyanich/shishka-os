import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
  },
}))

describe('useModifierOptions', () => {
  it('exports useModifierOptions hook', async () => {
    const mod = await import('./useModifierOptions')
    expect(mod.useModifierOptions).toBeDefined()
    expect(typeof mod.useModifierOptions).toBe('function')
  })
})
