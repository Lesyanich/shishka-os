import { describe, expect, it } from 'vitest'
import { CALENDAR_MARKERS, CALENDAR_TICKS } from '../calendar-config'

describe('CalendarRibbon', () => {
  it('exports CalendarRibbon component', async () => {
    const mod = await import('../CalendarRibbon')
    expect(typeof mod.CalendarRibbon).toBe('function')
  })

  it('has 11 day ticks with 6 majors', () => {
    expect(CALENDAR_TICKS).toHaveLength(11)
    expect(CALENDAR_TICKS.filter((t) => t.major)).toHaveLength(6)
  })

  it('includes Today, Recipe Lock, and Soft Opening markers', () => {
    const labels = CALENDAR_MARKERS.map((m) => m.label)
    expect(labels).toContain('Today')
    expect(labels).toContain('Recipe Lock')
    expect(labels).toContain('Soft Opening')
  })

  it('marker positions are in 0-100 range and monotonically increasing', () => {
    const positions = CALENDAR_MARKERS.map((m) => m.position)
    for (const p of positions) {
      expect(p).toBeGreaterThanOrEqual(0)
      expect(p).toBeLessThanOrEqual(100)
    }
    const sorted = [...positions].sort((a, b) => a - b)
    expect(positions).toEqual(sorted)
  })
})
