import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        or: () => ({ order: () => ({ error: null, data: [] }) }),
        in: () => ({ data: [], error: null }),
      }),
    }),
  },
}))

vi.mock('../contexts/AppRoleContext', () => ({
  useAppRole: () => ({ staffId: 'test-id', staffName: 'Test', role: 'cook' }),
}))

describe('KitchenRecipesPage', () => {
  it('exports KitchenRecipesPage component', async () => {
    const mod = await import('./KitchenRecipesPage')
    expect(mod.KitchenRecipesPage).toBeDefined()
    expect(typeof mod.KitchenRecipesPage).toBe('function')
  })
})
