import { describe, it, expect } from 'vitest'

describe('KbEditor', () => {
  it('exports the KbEditor component', async () => {
    const mod = await import('./KbEditor')
    expect(typeof mod.KbEditor).toBe('function')
  })
})
