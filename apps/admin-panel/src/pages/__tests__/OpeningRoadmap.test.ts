import { describe, expect, it } from 'vitest'

describe('OpeningRoadmap', () => {
  it('exports OpeningRoadmap component', async () => {
    const mod = await import('../OpeningRoadmap')
    expect(typeof mod.OpeningRoadmap).toBe('function')
  })
})
