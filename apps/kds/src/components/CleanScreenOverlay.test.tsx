import { describe, it, expect } from 'vitest'

describe('CleanScreenOverlay', () => {
  it('exports CleanScreenOverlay component', async () => {
    const mod = await import('./CleanScreenOverlay')
    expect(mod.CleanScreenOverlay).toBeDefined()
  })
})
