import { describe, it, expect } from 'vitest'
import type { Segment } from './SegmentBar'

describe('SegmentBar', () => {
  it('exports Segment type', () => {
    const seg: Segment = 'team'
    expect(seg).toBe('team')
  })

  it('accepts all segment values', () => {
    const values: Segment[] = ['team', 'tech', 'kitchen']
    expect(values).toHaveLength(3)
  })
})
