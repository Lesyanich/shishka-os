import { describe, it, expect } from 'vitest'
import {
  deriveClockStatus,
  getWeekDays,
  toISODate,
  formatTime,
  shiftFor,
  type ClockEvent,
} from './staffSchedule'

function ev(event_type: 'clock_in' | 'clock_out', event_at: string): ClockEvent {
  return {
    id: event_at,
    staff_id: 's1',
    shift_id: null,
    event_type,
    event_at,
    source: 'test',
    note: null,
    created_at: event_at,
  }
}

describe('deriveClockStatus', () => {
  it('no events → not clocked in', () => {
    expect(deriveClockStatus([])).toEqual({ isClockedIn: false, lastEvent: null })
  })
  it('last event clock_in → clocked in', () => {
    const s = deriveClockStatus([ev('clock_in', '2026-06-22T08:00:00Z')])
    expect(s.isClockedIn).toBe(true)
    expect(s.lastEvent?.event_type).toBe('clock_in')
  })
  it('clock_in then clock_out → not clocked in', () => {
    const events = [ev('clock_in', '2026-06-22T08:00:00Z'), ev('clock_out', '2026-06-22T17:00:00Z')]
    expect(deriveClockStatus(events).isClockedIn).toBe(false)
  })
  it('in / out / in → clocked in again', () => {
    const events = [
      ev('clock_in', '2026-06-22T08:00:00Z'),
      ev('clock_out', '2026-06-22T12:00:00Z'),
      ev('clock_in', '2026-06-22T13:00:00Z'),
    ]
    expect(deriveClockStatus(events).isClockedIn).toBe(true)
  })
})

describe('getWeekDays', () => {
  it('returns 7 Monday-anchored days for a mid-week reference', () => {
    // 2026-06-24 is a Wednesday → that week's Monday is 2026-06-22
    const days = getWeekDays(new Date(2026, 5, 24))
    expect(days).toHaveLength(7)
    expect(days[0].label).toBe('Mon')
    expect(days[0].iso).toBe('2026-06-22')
    expect(days[6].iso).toBe('2026-06-28')
  })
  it('anchors correctly when reference is already Monday', () => {
    const days = getWeekDays(new Date(2026, 5, 22))
    expect(days[0].iso).toBe('2026-06-22')
  })
})

describe('toISODate', () => {
  it('formats a local date as YYYY-MM-DD with zero padding', () => {
    expect(toISODate(new Date(2026, 5, 9))).toBe('2026-06-09')
  })
})

describe('formatTime', () => {
  it('trims HH:MM:SS to HH:MM', () => {
    expect(formatTime('08:30:00')).toBe('08:30')
  })
  it('returns empty string for null', () => {
    expect(formatTime(null)).toBe('')
  })
})

describe('shiftFor', () => {
  const shifts = [
    { staff_id: 'a', shift_date: '2026-06-22', start_time: '08:00:00', end_time: '16:00:00' },
    { staff_id: 'b', shift_date: '2026-06-22', start_time: '10:00:00', end_time: '18:00:00' },
  ]
  it('finds the matching shift', () => {
    expect(shiftFor(shifts, 'a', '2026-06-22')?.start_time).toBe('08:00:00')
  })
  it('returns null when the person is off that day', () => {
    expect(shiftFor(shifts, 'a', '2026-06-23')).toBeNull()
  })
})
