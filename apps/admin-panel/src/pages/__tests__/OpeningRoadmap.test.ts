import { describe, expect, it } from 'vitest'
import { computeCurrentPhaseId, defaultExpanded } from '../OpeningRoadmap.helpers'

// Component smoke test is covered by vitest's React-aware loading in CI
// (with VITE_SUPABASE_URL set). Pure-helper behaviour is validated below
// without pulling the Supabase client at import time.

describe('OpeningRoadmap helpers', () => {
  describe('computeCurrentPhaseId', () => {
    it('returns the first non-done phase', () => {
      const phases = [
        { config: { id: 0 }, status: 'done' },
        { config: { id: 1 }, status: 'done' },
        { config: { id: 2 }, status: 'in_progress' },
        { config: { id: 3 }, status: 'not_started' },
      ]
      expect(computeCurrentPhaseId(phases)).toBe(2)
    })

    it('falls back to last phase when all done', () => {
      const phases = [
        { config: { id: 0 }, status: 'done' },
        { config: { id: 1 }, status: 'done' },
      ]
      expect(computeCurrentPhaseId(phases)).toBe(1)
    })

    it('returns 0 for empty list', () => {
      expect(computeCurrentPhaseId([])).toBe(0)
    })
  })

  describe('defaultExpanded', () => {
    it('current phase is expanded', () => {
      expect(
        defaultExpanded({ phaseId: 2, phaseStatus: 'in_progress', currentPhaseId: 2 }),
      ).toBe(true)
    })

    it('done phases are collapsed', () => {
      expect(
        defaultExpanded({ phaseId: 0, phaseStatus: 'done', currentPhaseId: 2 }),
      ).toBe(false)
    })

    it('other non-done phases are expanded', () => {
      expect(
        defaultExpanded({
          phaseId: 3,
          phaseStatus: 'not_started',
          currentPhaseId: 2,
        }),
      ).toBe(true)
    })
  })
})
