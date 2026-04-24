import { describe, expect, it } from 'vitest'

describe('RoadmapHeader', () => {
  it('exports RoadmapHeader component', async () => {
    const mod = await import('../RoadmapHeader')
    expect(typeof mod.RoadmapHeader).toBe('function')
  })
})
