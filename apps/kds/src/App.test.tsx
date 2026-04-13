import { describe, it, expect } from 'vitest'

describe('App', () => {
  it('exports default component', async () => {
    const mod = await import('./App')
    expect(mod.default).toBeDefined()
  })
})
