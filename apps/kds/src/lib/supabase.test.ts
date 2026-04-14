import { describe, it, expect } from 'vitest'

describe('supabase', () => {
  it('exports supabase client', async () => {
    const mod = await import('./supabase')
    expect(mod.supabase).toBeDefined()
  })
})
