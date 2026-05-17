import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: () => Promise.resolve({ data: [], error: null }),
  },
}))

describe('useAllergens', () => {
  it('exports useAllergens hook and allergenDisplayName', async () => {
    const mod = await import('./useAllergens')
    expect(mod.useAllergens).toBeDefined()
    expect(mod.allergenDisplayName('allergen-gluten')).toBe('Gluten')
    expect(mod.allergenDisplayName('allergen-dairy')).toBe('Dairy')
  })
})
