import { describe, it, expect } from 'vitest'
import {
  localDayBounds,
  toISODate,
  deriveClockStatus,
  shiftFor,
  type ClockEvent,
} from '../staffSchedule'

describe('lib/staffSchedule — localDayBounds', () => {
  it('brackets the LOCAL calendar day of refDate as a half-open UTC instant range', () => {
    const ref = new Date(2026, 6, 10, 14, 30) // 2026-07-10 14:30 local
    const { startIso, endIso } = localDayBounds(ref)

    const start = new Date(startIso)
    const end = new Date(endIso)

    // Start is local midnight of the same local day.
    expect(toISODate(start)).toBe('2026-07-10')
    expect(start.getHours()).toBe(0)
    expect(start.getMinutes()).toBe(0)
    // End is exactly 24h later (next local midnight) → half-open window.
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000)
    expect(toISODate(end)).toBe('2026-07-11')
  })

  it('an early-morning local instant falls INSIDE its own local day window', () => {
    // 00:30 local — the exact case the old UTC-string query dropped.
    const ref = new Date(2026, 6, 10, 0, 30)
    const { startIso, endIso } = localDayBounds(ref)
    expect(ref.getTime()).toBeGreaterThanOrEqual(new Date(startIso).getTime())
    expect(ref.getTime()).toBeLessThan(new Date(endIso).getTime())
  })

  it('is stable regardless of the time of day passed in', () => {
    const a = localDayBounds(new Date(2026, 6, 10, 0, 0, 1))
    const b = localDayBounds(new Date(2026, 6, 10, 23, 59, 59))
    expect(a.startIso).toBe(b.startIso)
    expect(a.endIso).toBe(b.endIso)
  })
})

describe('lib/staffSchedule — clock + shift helpers (regression)', () => {
  const mk = (type: 'clock_in' | 'clock_out', at: string): ClockEvent => ({
    id: at,
    staff_id: 's1',
    shift_id: null,
    event_type: type,
    event_at: at,
    source: 'test',
    note: null,
    created_at: at,
  })

  it('deriveClockStatus: latest punch wins', () => {
    expect(deriveClockStatus([]).isClockedIn).toBe(false)
    expect(deriveClockStatus([mk('clock_in', '2026-07-10T02:00:00Z')]).isClockedIn).toBe(true)
    expect(
      deriveClockStatus([
        mk('clock_in', '2026-07-10T02:00:00Z'),
        mk('clock_out', '2026-07-10T10:00:00Z'),
      ]).isClockedIn,
    ).toBe(false)
  })

  it('shiftFor: matches staff + iso day, else null', () => {
    const shifts = [
      { staff_id: 's1', shift_date: '2026-07-10', start_time: '09:00:00', end_time: '18:00:00' },
    ]
    expect(shiftFor(shifts, 's1', '2026-07-10')?.start_time).toBe('09:00:00')
    expect(shiftFor(shifts, 's1', '2026-07-11')).toBeNull()
    expect(shiftFor(shifts, 's2', '2026-07-10')).toBeNull()
  })
})
