import { describe, expect, it } from 'vitest'

describe('RoadmapTopbar', () => {
  it('exports RoadmapTopbar component', async () => {
    const mod = await import('../RoadmapTopbar')
    expect(typeof mod.RoadmapTopbar).toBe('function')
  })
})
