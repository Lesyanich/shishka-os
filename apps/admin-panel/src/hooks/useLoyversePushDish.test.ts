import { describe, it, expect } from 'vitest'

describe('useLoyversePushDish', () => {
  it('exports the hook factory', async () => {
    const mod = await import('./useLoyversePushDish')
    expect(typeof mod.useLoyversePushDish).toBe('function')
  })
})
