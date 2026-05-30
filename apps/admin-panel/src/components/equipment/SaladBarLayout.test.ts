import { describe, it, expect } from 'vitest'

describe('SaladBarLayout', () => {
  it('module exports SaladBarLayout', async () => {
    const mod = await import('./SaladBarLayout')
    expect(mod.SaladBarLayout).toBeDefined()
  })
})
