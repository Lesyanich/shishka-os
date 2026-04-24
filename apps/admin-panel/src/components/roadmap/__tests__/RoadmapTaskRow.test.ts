import { describe, expect, it } from 'vitest'

describe('RoadmapTaskRow', () => {
  it('exports RoadmapTaskRow component', async () => {
    const mod = await import('../RoadmapTaskRow')
    expect(typeof mod.RoadmapTaskRow).toBe('function')
  })
})
