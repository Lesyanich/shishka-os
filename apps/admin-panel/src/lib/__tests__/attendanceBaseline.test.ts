// Pure-function tests for the attendance baseline builder.
import { describe, it, expect } from 'vitest'
import {
  buildAttendanceBaseline,
  attendanceKey,
  type BaselineStatus,
} from '../attendanceBaseline'

const ALLOWED: BaselineStatus[] = ['worked', 'holiday', 'day_off']

describe('lib/attendanceBaseline', () => {
  it('maps holiday -> holiday, shift -> worked, else -> day_off', () => {
    const shifts = new Map([['mint', new Set(['2026-06-02', '2026-06-04'])]])
    const holidays = new Set(['2026-06-03'])
    const rows = buildAttendanceBaseline(2026, 6, ['mint'], shifts, holidays, new Set())

    const byDate = Object.fromEntries(rows.map((r) => [r.attendance_date, r.status]))
    expect(byDate['2026-06-02']).toBe('worked')
    expect(byDate['2026-06-04']).toBe('worked')
    expect(byDate['2026-06-03']).toBe('holiday')
    expect(byDate['2026-06-01']).toBe('day_off') // Monday, no shift
  })

  it('NEVER emits absent (payroll safety)', () => {
    const shifts = new Map([['mint', new Set(['2026-06-02'])]])
    const rows = buildAttendanceBaseline(2026, 6, ['mint'], shifts, new Set(), new Set())
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => ALLOWED.includes(r.status))).toBe(true)
    expect(rows.some((r) => (r.status as string) === 'absent')).toBe(false)
  })

  it('preserves existing manager edits (gap-fill only)', () => {
    const shifts = new Map([['mint', new Set(['2026-06-02', '2026-06-03'])]])
    const existing = new Set([attendanceKey('mint', '2026-06-02')]) // manager set this day
    const rows = buildAttendanceBaseline(2026, 6, ['mint'], shifts, new Set(), existing)
    expect(rows.some((r) => r.attendance_date === '2026-06-02')).toBe(false) // skipped
    expect(rows.some((r) => r.attendance_date === '2026-06-03')).toBe(true) // gap filled
  })

  it('covers every day for every staff (minus existing)', () => {
    const rows = buildAttendanceBaseline(2026, 6, ['a', 'b'], new Map(), new Set(), new Set())
    expect(rows).toHaveLength(30 * 2)
  })
})
