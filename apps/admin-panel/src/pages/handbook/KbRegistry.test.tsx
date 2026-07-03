import { describe, it, expect } from 'vitest'

describe('KbRegistry', () => {
  it('exports the KbRegistry component', async () => {
    const mod = await import('./KbRegistry')
    expect(typeof mod.KbRegistry).toBe('function')
  })
})
