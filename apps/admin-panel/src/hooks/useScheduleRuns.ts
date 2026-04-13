import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ScheduleRun, ScheduleResult, StaffAssignResult } from '../types/scheduling'

export interface UseScheduleRunsResult {
  runs: ScheduleRun[]
  isLoading: boolean
  error: string | null
  generateSchedule: (date: string) => Promise<ScheduleResult>
  assignStaff: (runId: string) => Promise<StaffAssignResult>
  activateRun: (runId: string) => Promise<{ ok: boolean; error?: string }>
  refetch: () => void
}

export function useScheduleRuns(date: string): UseScheduleRunsResult {
  const [runs, setRuns] = useState<ScheduleRun[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRuns = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('schedule_runs')
      .select('*')
      .eq('date', date)
      .order('generated_at', { ascending: false })

    if (fetchError) {
      setError(fetchError.message)
    } else {
      setRuns((data ?? []) as ScheduleRun[])
    }
    setIsLoading(false)
  }, [date])

  useEffect(() => { fetchRuns() }, [fetchRuns])

  const generateSchedule = useCallback(async (targetDate: string): Promise<ScheduleResult> => {
    const { data, error } = await supabase.rpc('fn_generate_daily_schedule', {
      p_date: targetDate,
    })

    if (error) return { ok: false, run_id: '', task_count: 0, conflict_count: 0, conflicts: [] }
    await fetchRuns()
    return data as ScheduleResult
  }, [fetchRuns])

  const assignStaff = useCallback(async (runId: string): Promise<StaffAssignResult> => {
    const { data, error } = await supabase.rpc('fn_assign_staff_to_schedule', {
      p_run_id: runId,
    })

    if (error) return { ok: false, assigned: 0, unassigned: 0 }
    return data as StaffAssignResult
  }, [])

  const activateRun = useCallback(async (runId: string) => {
    // Archive all other runs for this date
    await supabase
      .from('schedule_runs')
      .update({ status: 'archived' })
      .eq('date', date)
      .neq('id', runId)

    const { error } = await supabase
      .from('schedule_runs')
      .update({ status: 'active' })
      .eq('id', runId)

    if (error) return { ok: false, error: error.message }
    await fetchRuns()
    return { ok: true }
  }, [date, fetchRuns])

  return { runs, isLoading, error, generateSchedule, assignStaff, activateRun, refetch: fetchRuns }
}
