import { describe, expect, it } from 'vitest'
import { useStationChecklist } from './useStationChecklist'

// Row normalization/sorting logic is covered in src/types/stations.test.ts
// (normalizeChecklistRow, compareChecklistRows) — the hook is a thin fetcher.
describe('useStationChecklist', () => {
  it('exports a hook function', () => {
    expect(typeof useStationChecklist).toBe('function')
    expect(useStationChecklist.name).toBe('useStationChecklist')
  })
})
