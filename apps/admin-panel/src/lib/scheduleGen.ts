// Pure, deterministic schedule-generation helpers.
//
// Weekday encoding: JS Date.getDay() 0..6 (0=Sunday .. 6=Saturday) everywhere.
// Dates are built manually from local Y/M/D (never via toISOString) to avoid a
// UTC off-by-one for users in Asia/Bangkok (UTC+7).

export interface ScheduleTemplate {
  staff_id: string
  /** JS getDay() values 0..6 the staff member works. Tue–Sun (closed Mon) = [0,2,3,4,5,6]. */
  working_weekdays: number[]
  start_time: string
  end_time: string
  break_minutes: number
  location_id?: string | null
}

export interface GeneratedShiftRow {
  staff_id: string
  location_id: string | null
  shift_date: string // YYYY-MM-DD
  start_time: string
  end_time: string
  break_minutes: number
  status: 'scheduled'
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Local date string YYYY-MM-DD. month is 1..12. */
export function dateStr(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

/** Number of days in the given month (month is 1..12). */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/** All YYYY-MM-DD strings for the month (month is 1..12). */
export function monthDateStrings(year: number, month: number): string[] {
  const n = daysInMonth(year, month)
  return Array.from({ length: n }, (_, i) => dateStr(year, month, i + 1))
}

/**
 * Generate the shift rows for a whole month from per-staff weekly templates.
 * Weekday-anchored (NOT a rolling cycle); skips public holidays (shop closed).
 */
export function generateMonthShifts(
  year: number,
  month: number,
  templates: ScheduleTemplate[],
  holidayDates: Set<string>,
): GeneratedShiftRow[] {
  const rows: GeneratedShiftRow[] = []
  const n = daysInMonth(year, month)
  for (let day = 1; day <= n; day++) {
    const date = dateStr(year, month, day)
    if (holidayDates.has(date)) continue // closed on public holidays
    const weekday = new Date(year, month - 1, day).getDay() // local 0..6
    for (const t of templates) {
      if (!t.working_weekdays.includes(weekday)) continue
      rows.push({
        staff_id: t.staff_id,
        location_id: t.location_id ?? null,
        shift_date: date,
        start_time: t.start_time,
        end_time: t.end_time,
        break_minutes: t.break_minutes,
        status: 'scheduled',
      })
    }
  }
  return rows
}
