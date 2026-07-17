import { describe, it, expect } from 'vitest'

describe('usePunctuality', () => {
  it('exports usePunctuality and useTodayPunctuality hooks', async () => {
    const mod = await import('./usePunctuality')
    expect(typeof mod.usePunctuality).toBe('function')
    expect(typeof mod.useTodayPunctuality).toBe('function')
  })
})
