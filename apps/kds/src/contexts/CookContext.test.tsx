import { describe, it, expect } from 'vitest'

describe('CookContext', () => {
  it('exports CookProvider and useCook', async () => {
    const mod = await import('./CookContext')
    expect(mod.CookProvider).toBeDefined()
    expect(mod.useCook).toBeDefined()
  })
})
