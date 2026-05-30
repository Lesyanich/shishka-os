import { describe, it, expect } from 'vitest'

describe('SaladBarPage', () => {
  it('module exports SaladBarPage', async () => {
    const mod = await import('./SaladBarPage')
    expect(mod.SaladBarPage).toBeDefined()
  })
})
