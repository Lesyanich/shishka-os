import { describe, it, expect } from 'vitest'
import type { ScoreBucket, GapRow, LowScoreQuery } from './brainQuality'

describe('brainQuality types', () => {
  it('ScoreBucket shape', () => {
    const bucket: ScoreBucket = { score: 3, count: 10 }
    expect(bucket.score).toBe(3)
  })

  it('GapRow shape', () => {
    const gap: GapRow = {
      layer: 'L2',
      query_pattern: 'test query',
      hit_count: 2,
      first_seen: '2026-04-11T00:00:00Z',
      last_seen: '2026-04-11T12:00:00Z',
      avg_score: 1.5,
      agents: ['chef-agent'],
    }
    expect(gap.layer).toBe('L2')
  })

  it('LowScoreQuery shape', () => {
    const q: LowScoreQuery = {
      id: 'abc',
      ts: '2026-04-11T00:00:00Z',
      layer: 'L1',
      agent_id: null,
      query_preview: 'test',
      response_preview: 'result',
      quality_score: 2,
      quality_source: 'heuristic',
      chunks_returned: 0,
    }
    expect(q.quality_score).toBe(2)
  })
})
