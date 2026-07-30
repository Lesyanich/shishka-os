import { describe, it, expect, vi } from 'vitest'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
    }),
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
}))

describe('CookStationPanel', () => {
  it('exports the panel', async () => {
    const mod = await import('./CookStationPanel')
    expect(mod.CookStationPanel).toBeTypeOf('function')
  })
})
