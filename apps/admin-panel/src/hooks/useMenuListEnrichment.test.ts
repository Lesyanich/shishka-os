import { describe, it, expect } from 'vitest'

// Smoke test — verifies module imports + named export exists.
// Full hook behavior covered by integration tests when present.
describe('useMenuListEnrichment', () => {
  it('exports the hook factory', async () => {
    const mod = await import('./useMenuListEnrichment')
    expect(typeof mod.useMenuListEnrichment).toBe('function')
  })
})
