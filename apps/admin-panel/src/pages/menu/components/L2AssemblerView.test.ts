import { describe, it, expect } from 'vitest'

describe('L2AssemblerView', () => {
  it('exports the component', async () => {
    const mod = await import('./L2AssemblerView')
    expect(typeof mod.L2AssemblerView).toBe('function')
  })
})
