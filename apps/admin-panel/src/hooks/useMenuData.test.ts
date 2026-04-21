import { describe, it, expect, vi } from 'vitest'

// Supabase client init fails in test env without VITE_SUPABASE_URL. Stub before
// pulling the hook so the smoke test proves the module loads cleanly.
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ or: () => ({ order: () => ({ error: null, data: [] }) }) }),
    }),
  },
}))

describe('useMenuData', () => {
  it('exports useMenuData hook', async () => {
    const mod = await import('./useMenuData')
    expect(mod.useMenuData).toBeDefined()
    expect(typeof mod.useMenuData).toBe('function')
  })
})
