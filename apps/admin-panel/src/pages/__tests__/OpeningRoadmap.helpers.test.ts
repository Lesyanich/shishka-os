import { describe, expect, it } from 'vitest'

describe('OpeningRoadmap.helpers', () => {
  it('exports pure helpers', async () => {
    const mod = await import('../OpeningRoadmap.helpers')
    expect(typeof mod.computeCurrentPhaseId).toBe('function')
    expect(typeof mod.defaultExpanded).toBe('function')
  })
})
