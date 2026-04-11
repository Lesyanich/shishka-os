import { describe, it, expect } from 'vitest'

describe('QueryPlayground', () => {
  it('module exports QueryPlayground component', async () => {
    const mod = await import('./QueryPlayground')
    expect(mod.QueryPlayground).toBeDefined()
    expect(typeof mod.QueryPlayground).toBe('function')
  })
})
