import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../../lib/supabase', () => ({
  supabase: {
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
}))

describe('OwnerTab', () => {
  it('exports OwnerTab component', async () => {
    const mod = await import('./OwnerTab')
    expect(mod.OwnerTab).toBeDefined()
  })
})
