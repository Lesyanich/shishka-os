import { describe, it, expect } from 'vitest'

describe('AssemblyOrderEditor', () => {
  it('exports AssemblyOrderEditor component', async () => {
    const mod = await import('./AssemblyOrderEditor')
    expect(mod.AssemblyOrderEditor).toBeDefined()
  })
})
