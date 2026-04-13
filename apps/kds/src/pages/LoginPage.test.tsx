import { describe, it, expect } from 'vitest'

describe('LoginPage', () => {
  it('exports LoginPage component', async () => {
    const mod = await import('./LoginPage')
    expect(mod.LoginPage).toBeDefined()
  })
})
