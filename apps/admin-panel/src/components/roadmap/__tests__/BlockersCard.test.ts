import { describe, expect, it } from 'vitest'

describe('BlockersCard', () => {
  it('exports BlockersCard component', async () => {
    const mod = await import('../BlockersCard')
    expect(typeof mod.BlockersCard).toBe('function')
  })
})
