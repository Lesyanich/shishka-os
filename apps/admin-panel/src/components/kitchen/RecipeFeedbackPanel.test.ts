import { describe, it, expect, vi } from 'vitest'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ order: () => ({ data: [], error: null }) }),
      }),
      insert: () => ({ select: () => ({ single: () => ({ data: null, error: null }) }) }),
      delete: () => ({ eq: () => ({ error: null }) }),
    }),
  },
}))

vi.mock('../../contexts/AppRoleContext', () => ({
  useAppRole: () => ({ staffId: 'test-id', staffName: 'Test', role: 'cook' }),
}))

vi.mock('../../hooks/useRecipeFeedback', () => ({
  useRecipeFeedback: () => ({
    feedback: [],
    isLoading: false,
    addFeedback: vi.fn(),
    deleteFeedback: vi.fn(),
  }),
}))

describe('RecipeFeedbackPanel', () => {
  it('exports RecipeFeedbackPanel component', async () => {
    const mod = await import('./RecipeFeedbackPanel')
    expect(mod.RecipeFeedbackPanel).toBeDefined()
    expect(typeof mod.RecipeFeedbackPanel).toBe('function')
  })
})
