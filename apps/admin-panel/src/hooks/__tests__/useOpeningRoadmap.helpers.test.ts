import { describe, expect, it } from 'vitest'

// Smoke test — meaningful unit tests live in useOpeningRoadmap.test.ts
// (inferOwner, daysSince, deriveMustDo, deriveBlockers).
describe('useOpeningRoadmap.helpers', () => {
  it('exports the pure helpers', async () => {
    const mod = await import('../useOpeningRoadmap.helpers')
    expect(typeof mod.inferOwner).toBe('function')
    expect(typeof mod.daysSince).toBe('function')
    expect(typeof mod.deriveMustDo).toBe('function')
    expect(typeof mod.deriveBlockers).toBe('function')
    expect(typeof mod.parsePhaseTag).toBe('function')
    expect(typeof mod.derivePhaseStatus).toBe('function')
  })
})
