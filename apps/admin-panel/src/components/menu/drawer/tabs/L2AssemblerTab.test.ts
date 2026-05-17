import { describe, it, expect } from 'vitest'

describe('L2AssemblerTab', () => {
  it('exports L2AssemblerTab component', async () => {
    const mod = await import('./L2AssemblerTab')
    expect(mod.L2AssemblerTab).toBeDefined()
  })
})
