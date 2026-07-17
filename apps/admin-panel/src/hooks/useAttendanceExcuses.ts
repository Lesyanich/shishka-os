import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface AttendanceExcuse {
  shift_id: string
  reason: string
  excused_by: string | null
  excused_at: string
}

export interface UseAttendanceExcusesResult {
  excuses: AttendanceExcuse[]
  isSaving: boolean
  error: string | null
  excuse: (shiftId: string, reason: string) => Promise<boolean>
  unexcuse: (shiftId: string) => Promise<boolean>
  refetch: () => void
}

/**
 * Owner-marked excuses for individual shifts (`attendance_excuses`, mig 370).
 *
 * An excused shift leaves the discipline counter and the unpaid-minutes total.
 * Writes are owner-only at the DB level (RLS) — the administrator is the main
 * subject of this policy and cannot excuse herself.
 */
export function useAttendanceExcuses(excusedBy: string | null): UseAttendanceExcusesResult {
  const [excuses, setExcuses] = useState<AttendanceExcuse[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchExcuses = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from('attendance_excuses')
      .select('shift_id, reason, excused_by, excused_at')

    if (fetchError) {
      console.error('[useAttendanceExcuses] fetch error', fetchError)
      setError(fetchError.message)
      return
    }
    setExcuses((data ?? []) as AttendanceExcuse[])
  }, [])

  useEffect(() => {
    fetchExcuses()
  }, [fetchExcuses])

  const excuse = useCallback(
    async (shiftId: string, reason: string): Promise<boolean> => {
      setIsSaving(true)
      setError(null)
      const { error: upsertError } = await supabase
        .from('attendance_excuses')
        .upsert(
          { shift_id: shiftId, reason, excused_by: excusedBy },
          { onConflict: 'shift_id' },
        )
      setIsSaving(false)
      if (upsertError) {
        console.error('[useAttendanceExcuses] excuse error', upsertError)
        setError(upsertError.message)
        return false
      }
      await fetchExcuses()
      return true
    },
    [excusedBy, fetchExcuses],
  )

  const unexcuse = useCallback(
    async (shiftId: string): Promise<boolean> => {
      setIsSaving(true)
      setError(null)
      const { error: deleteError } = await supabase
        .from('attendance_excuses')
        .delete()
        .eq('shift_id', shiftId)
      setIsSaving(false)
      if (deleteError) {
        console.error('[useAttendanceExcuses] unexcuse error', deleteError)
        setError(deleteError.message)
        return false
      }
      await fetchExcuses()
      return true
    },
    [fetchExcuses],
  )

  return { excuses, isSaving, error, excuse, unexcuse, refetch: fetchExcuses }
}
