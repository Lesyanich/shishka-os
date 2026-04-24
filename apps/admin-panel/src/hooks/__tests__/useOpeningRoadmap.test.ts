import { describe, expect, it } from 'vitest'

// Smoke test — validates the module can be imported and exports the expected shape.
// Full integration tests require Supabase mocking which is out of scope for HC-3 gate.

describe('useOpeningRoadmap', () => {
  it('exports useOpeningRoadmap function', async () => {
    const mod = await import('../useOpeningRoadmap')
    expect(typeof mod.useOpeningRoadmap).toBe('function')
  })
})
