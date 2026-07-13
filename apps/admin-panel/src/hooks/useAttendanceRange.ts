import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Read-only staff_attendance for a [startIso, endIso] date window, indexed
 * `staff_id|attendance_date` → status. Powers the attendance overlay on the
 * schedule grids so day-off / leave marked in /hr/attendance is visible there.
 *
 * Plain fetch on window change (no realtime): attendance is edited on a
 * separate page, and the schedule view remounts on navigation.
 */
export function useAttendanceRange(startIso: string, endIso: string) {
  const [attendanceByKey, setAttendanceByKey] = useState<Map<string, string>>(new Map())
  const [isLoading, setIsLoading] = useState(true)

  const fetchRange = useCallback(async () => {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('staff_attendance')
      .select('staff_id, attendance_date, status')
      .gte('attendance_date', startIso)
      .lte('attendance_date', endIso)

    if (error) {
      console.error('[useAttendanceRange] fetch error', error)
      setAttendanceByKey(new Map())
      setIsLoading(false)
      return
    }

    const map = new Map<string, string>()
    for (const r of data ?? []) {
      map.set(`${r.staff_id}|${r.attendance_date}`, r.status as string)
    }
    setAttendanceByKey(map)
    setIsLoading(false)
  }, [startIso, endIso])

  useEffect(() => {
    fetchRange()
  }, [fetchRange])

  return { attendanceByKey, isLoading, refetch: fetchRange }
}
