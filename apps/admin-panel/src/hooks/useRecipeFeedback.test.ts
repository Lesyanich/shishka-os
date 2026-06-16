import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ order: () => ({ data: [], error: null }) }),
        in: () => ({ data: [], error: null }),
      }),
      insert: () => ({ select: () => ({ single: () => ({ data: null, error: null }) }) }),
      delete: () => ({ eq: () => ({ error: null }) }),
    }),
  },
}))

describe('useRecipeFeedback', () => {
  it('exports useRecipeFeedback hook', async () => {
    const mod = await import('./useRecipeFeedback')
    expect(mod.useRecipeFeedback).toBeDefined()
    expect(typeof mod.useRecipeFeedback).toBe('function')
  })

  it('exports useFeedbackCounts hook', async () => {
    const mod = await import('./useRecipeFeedback')
    expect(mod.useFeedbackCounts).toBeDefined()
    expect(typeof mod.useFeedbackCounts).toBe('function')
  })
})
