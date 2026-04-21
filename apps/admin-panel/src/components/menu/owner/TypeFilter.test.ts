import { describe, it, expect } from 'vitest'

describe('owner/TypeFilter', () => {
  it('exports TypeFilter component', async () => {
    const mod = await import('./TypeFilter')
    expect(mod.TypeFilter).toBeDefined()
    expect(typeof mod.TypeFilter).toBe('function')
  })
})
