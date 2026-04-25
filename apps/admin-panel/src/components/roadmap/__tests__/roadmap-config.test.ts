import { describe, expect, it } from 'vitest'
import { OPENING_PHASES, INITIATIVE_ID, POLL_INTERVAL_MS } from '../roadmap-config'

describe('roadmap-config', () => {
  it('exports 6 phases', () => {
    expect(OPENING_PHASES).toHaveLength(6)
  })

  it('phases have sequential IDs 0-5', () => {
    const ids = OPENING_PHASES.map((p) => p.id)
    expect(ids).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('each phase has a unique tag matching phase-N pattern', () => {
    for (const phase of OPENING_PHASES) {
      expect(phase.tag).toBe(`phase-${phase.id}`)
    }
  })

  it('exports a valid initiative UUID', () => {
    expect(INITIATIVE_ID).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
  })

  it('poll interval is 60 seconds', () => {
    expect(POLL_INTERVAL_MS).toBe(60_000)
  })

  it('phase 0 has a lockDay', () => {
    const phase0 = OPENING_PHASES[0]
    expect(phase0.lockDay).toBeDefined()
    expect(typeof phase0.lockDay).toBe('string')
  })
})
