// Pure baseline builder for staff_attendance, derived from the schedule.
//
// PAYROLL SAFETY: this only ever emits 'worked' | 'holiday' | 'day_off'.
// fn_calculate_payroll counts 'worked' as paid and IGNORES 'holiday'/'day_off',
// and only DEDUCTS for 'absent'. By never emitting 'absent', the baseline
// yields full salary and cannot reduce pay. Days a manager already set
// (sick_leave, absent, etc.) are preserved via existingKeys.

import { monthDateStrings } from './scheduleGen'

export type BaselineStatus = 'worked' | 'holiday' | 'day_off'

export interface BaselineRow {
  staff_id: string
  attendance_date: string
  status: BaselineStatus
}

/** Key for the existing-records set: `${staff_id}|${YYYY-MM-DD}`. */
export function attendanceKey(staffId: string, date: string): string {
  return `${staffId}|${date}`
}

/**
 * Build attendance rows for the gaps only (days with no existing record).
 * Priority per day: public holiday -> 'holiday'; has a shift -> 'worked'; else 'day_off'.
 */
export function buildAttendanceBaseline(
  year: number,
  month: number,
  staffIds: string[],
  shiftDatesByStaff: Map<string, Set<string>>,
  holidayDates: Set<string>,
  existingKeys: Set<string>,
): BaselineRow[] {
  const rows: BaselineRow[] = []
  const dates = monthDateStrings(year, month)
  for (const staffId of staffIds) {
    const shiftDates = shiftDatesByStaff.get(staffId) ?? new Set<string>()
    for (const date of dates) {
      if (existingKeys.has(attendanceKey(staffId, date))) continue // preserve edits
      let status: BaselineStatus
      if (holidayDates.has(date)) status = 'holiday'
      else if (shiftDates.has(date)) status = 'worked'
      else status = 'day_off'
      rows.push({ staff_id: staffId, attendance_date: date, status })
    }
  }
  return rows
}
