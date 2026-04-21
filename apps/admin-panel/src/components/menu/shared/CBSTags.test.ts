import { describe, it, expect } from 'vitest'

describe('shared/CBSTags', () => {
  it('exports CBSTags component', async () => {
    const mod = await import('./CBSTags')
    expect(mod.CBSTags).toBeDefined()
    expect(typeof mod.CBSTags).toBe('function')
  })
})
