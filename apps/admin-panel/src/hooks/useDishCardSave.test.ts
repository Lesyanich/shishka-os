import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: () =>
      Promise.resolve({ data: { ok: true, new_version: 2 }, error: null }),
  },
}))

describe('useDishCardSave', () => {
  it('exports useDishCardSave hook', async () => {
    const mod = await import('./useDishCardSave')
    expect(mod.useDishCardSave).toBeDefined()
    expect(typeof mod.useDishCardSave).toBe('function')
  })
})
