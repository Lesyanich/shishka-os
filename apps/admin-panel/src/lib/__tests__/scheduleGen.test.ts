// Pure-function tests for monthly schedule generation.
import { describe, it, expect } from 'vitest'
import {
  dateStr,
  daysInMonth,
  monthDateStrings,
  generateMonthShifts,
  type ScheduleTemplate,
} from '../scheduleGen'

const TUE_TO_SUN = [0, 2, 3, 4, 5, 6] // closed Monday (getDay 1)

const mintTpl: ScheduleTemplate = {
  staff_id: 'mint',
  working_weekdays: TUE_TO_SUN,
  start_time: '08:00',
  end_time: '17:00',
  break_minutes: 60,
  location_id: null,
}

describe('lib/scheduleGen', () => {
  describe('date helpers', () => {
    it('dateStr pads month/day, no UTC round-trip', () => {
      expect(dateStr(2026, 6, 1)).toBe('2026-06-01')
      expect(dateStr(2026, 12, 31)).toBe('2026-12-31')
    })
    it('daysInMonth handles 30/31 and leap February', () => {
      expect(daysInMonth(2026, 6)).toBe(30)
      expect(daysInMonth(2026, 2)).toBe(28)
      expect(daysInMonth(2024, 2)).toBe(29) // leap
    })
    it('monthDateStrings spans the whole month', () => {
      const d = monthDateStrings(2026, 6)
      expect(d).toHaveLength(30)
      expect(d[0]).toBe('2026-06-01')
      expect(d[29]).toBe('2026-06-30')
    })
  })

  describe('generateMonthShifts', () => {
    it('never schedules on the closed weekday (Monday)', () => {
      const rows = generateMonthShifts(2026, 6, [mintTpl], new Set())
      // June 2026 Mondays: 1, 8, 15, 22, 29
      const mondays = ['2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22', '2026-06-29']
      for (const m of mondays) {
        expect(rows.some((r) => r.shift_date === m)).toBe(false)
      }
      // Tuesday 2026-06-02 must be scheduled
      expect(rows.some((r) => r.shift_date === '2026-06-02')).toBe(true)
    })

    it('skips public holidays', () => {
      const holidays = new Set(['2026-06-03']) // Queen Suthida (a Wednesday)
      const rows = generateMonthShifts(2026, 6, [mintTpl], holidays)
      expect(rows.some((r) => r.shift_date === '2026-06-03')).toBe(false)
    })

    it('counts: June 2026 Tue-Sun minus one holiday = 24 shifts/template', () => {
      const holidays = new Set(['2026-06-03'])
      const rows = generateMonthShifts(2026, 6, [mintTpl], holidays)
      // 30 days - 5 Mondays = 25 working days - 1 holiday = 24
      expect(rows).toHaveLength(24)
      expect(rows.every((r) => r.status === 'scheduled')).toBe(true)
      expect(rows.every((r) => r.break_minutes === 60)).toBe(true)
    })

    it('multiplies rows across templates', () => {
      const rows = generateMonthShifts(
        2026,
        6,
        [mintTpl, { ...mintTpl, staff_id: 'hein' }],
        new Set(),
      )
      expect(rows.filter((r) => r.staff_id === 'mint')).toHaveLength(25)
      expect(rows.filter((r) => r.staff_id === 'hein')).toHaveLength(25)
    })

    it('empty templates yield no rows', () => {
      expect(generateMonthShifts(2026, 6, [], new Set())).toEqual([])
    })
  })
})
