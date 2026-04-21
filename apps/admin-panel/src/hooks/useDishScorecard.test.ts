import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({
  supabase: { rpc: vi.fn(() => Promise.resolve({ data: null, error: null })) },
}))

import { SCORECARD_AXIS_LABELS, useDishScorecard } from './useDishScorecard'

describe('useDishScorecard', () => {
  it('exports useDishScorecard and SCORECARD_AXIS_LABELS', () => {
    expect(useDishScorecard).toBeDefined()
    expect(typeof useDishScorecard).toBe('function')
    expect(SCORECARD_AXIS_LABELS.cbs).toBe('CBS Coverage')
    expect(SCORECARD_AXIS_LABELS.cost).toBe('Cost Discipline')
  })
})
