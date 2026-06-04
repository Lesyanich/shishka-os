import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { buildAttendanceBaseline, attendanceKey } from '../lib/attendanceBaseline'

export interface AttendanceRecord {
  id: string
  staff_id: string
  attendance_date: string
  status: string
  overtime_hours: number
  overtime_type: string | null
  notes: string | null
}

export interface StaffMember {
  id: string
  name: string
  role: string
  monthly_salary: number | null
}

export interface PublicHoliday {
  holiday_date: string
  name_en: string
}

export type AttendanceStatus =
  | 'worked'
  | 'absent'
  | 'sick_leave'
  | 'annual_leave'
  | 'personal_leave'
  | 'maternity_leave'
  | 'paternity_leave'
  | 'holiday'
  | 'day_off'

export function useAttendance(year: number, month: number) {
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([])
  const [holidays, setHolidays] = useState<PublicHoliday[]>([])
  const [closedWeekday, setClosedWeekday] = useState(1) // JS getDay(); 1 = Monday (default)
  const [isLoading, setIsLoading] = useState(true)

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endDate =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, '0')}-01`

  const fetchData = useCallback(async () => {
    setIsLoading(true)

    const [staffRes, attendanceRes, holidaysRes, configRes] = await Promise.all([
      supabase
        .from('staff')
        .select('id, name, role, monthly_salary')
        .eq('is_active', true)
        .not('monthly_salary', 'is', null)
        .order('name'),
      supabase
        .from('staff_attendance')
        .select('*')
        .gte('attendance_date', startDate)
        .lt('attendance_date', endDate),
      supabase
        .from('public_holidays')
        .select('holiday_date, name_en')
        .gte('holiday_date', startDate)
        .lt('holiday_date', endDate),
      supabase
        .from('payroll_config')
        .select('value')
        .eq('key', 'closed_weekday')
        .maybeSingle(),
    ])

    if (staffRes.data) setStaff(staffRes.data)
    if (attendanceRes.data) setAttendance(attendanceRes.data)
    if (holidaysRes.data) setHolidays(holidaysRes.data)
    if (configRes.data?.value != null) setClosedWeekday(Number(configRes.data.value))

    setIsLoading(false)
  }, [startDate, endDate])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const upsertDay = useCallback(
    async (
      staffId: string,
      date: string,
      status: AttendanceStatus,
      overtimeHours?: number,
      overtimeType?: string | null,
    ) => {
      const record = {
        staff_id: staffId,
        attendance_date: date,
        status,
        overtime_hours: overtimeHours ?? 0,
        overtime_type: overtimeType ?? null,
      }

      // Optimistic update
      setAttendance((prev) => {
        const existing = prev.findIndex(
          (r) => r.staff_id === staffId && r.attendance_date === date,
        )
        if (existing >= 0) {
          const updated = [...prev]
          updated[existing] = { ...updated[existing], ...record }
          return updated
        }
        return [...prev, { ...record, id: crypto.randomUUID(), notes: null }]
      })

      const { error } = await supabase
        .from('staff_attendance')
        .upsert(record, { onConflict: 'staff_id,attendance_date' })

      if (error) {
        // Revert on error
        await fetchData()
      }
    },
    [fetchData],
  )

  const removeDay = useCallback(
    async (staffId: string, date: string) => {
      setAttendance((prev) =>
        prev.filter(
          (r) => !(r.staff_id === staffId && r.attendance_date === date),
        ),
      )

      const { error } = await supabase
        .from('staff_attendance')
        .delete()
        .eq('staff_id', staffId)
        .eq('attendance_date', date)

      if (error) {
        await fetchData()
      }
    },
    [fetchData],
  )

  /**
   * Pre-fill the month's attendance baseline from the schedule + holidays.
   * Fills ONLY days with no existing record (preserves manager edits).
   * Statuses written: 'worked' | 'holiday' | 'day_off' — never 'absent' (payroll-safe).
   * Returns the number of rows created.
   */
  const prefillMonth = useCallback(async (): Promise<number> => {
    // Shifts in the month → which days each staff is scheduled (ignore no_show).
    const { data: shiftRows } = await supabase
      .from('shifts')
      .select('staff_id, shift_date, status')
      .gte('shift_date', startDate)
      .lt('shift_date', endDate)
      .neq('status', 'no_show')

    const shiftDatesByStaff = new Map<string, Set<string>>()
    for (const row of shiftRows ?? []) {
      const set = shiftDatesByStaff.get(row.staff_id) ?? new Set<string>()
      set.add(row.shift_date as string)
      shiftDatesByStaff.set(row.staff_id, set)
    }

    const holidayDates = new Set(holidays.map((h) => h.holiday_date))
    const existingKeys = new Set(
      attendance.map((r) => attendanceKey(r.staff_id, r.attendance_date)),
    )
    const staffIds = staff.map((s) => s.id)

    const rows = buildAttendanceBaseline(
      year,
      month,
      staffIds,
      shiftDatesByStaff,
      holidayDates,
      existingKeys,
    )

    if (rows.length > 0) {
      const { error } = await supabase
        .from('staff_attendance')
        .upsert(rows, { onConflict: 'staff_id,attendance_date', ignoreDuplicates: true })
      if (error) {
        console.error('[useAttendance] prefill error', error)
        await fetchData()
        return 0
      }
    }

    await fetchData()
    return rows.length
  }, [year, month, startDate, endDate, staff, attendance, holidays, fetchData])

  return { staff, attendance, holidays, closedWeekday, isLoading, upsertDay, removeDay, prefillMonth }
}
