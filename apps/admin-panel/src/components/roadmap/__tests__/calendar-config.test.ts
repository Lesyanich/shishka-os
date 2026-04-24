import { describe, expect, it } from 'vitest'
import { CALENDAR_MARKERS, CALENDAR_TICKS } from '../calendar-config'

describe('calendar-config', () => {
  it('exports ticks and markers', () => {
    expect(Array.isArray(CALENDAR_TICKS)).toBe(true)
    expect(Array.isArray(CALENDAR_MARKERS)).toBe(true)
  })
})
