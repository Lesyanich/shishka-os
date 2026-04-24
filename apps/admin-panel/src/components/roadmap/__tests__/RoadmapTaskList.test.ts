import { describe, expect, it } from 'vitest'

describe('RoadmapTaskList', () => {
  it('exports RoadmapTaskList component', async () => {
    const mod = await import('../RoadmapTaskList')
    expect(typeof mod.RoadmapTaskList).toBe('function')
  })
})
