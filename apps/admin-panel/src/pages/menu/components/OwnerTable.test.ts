import { describe, it, expect } from 'vitest'

describe('OwnerTable', () => {
  it('exports OwnerTable component', async () => {
    const mod = await import('./OwnerTable')
    expect(mod.OwnerTable).toBeDefined()
    expect(typeof mod.OwnerTable).toBe('function')
  })
})
