import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface CookTask {
  id: string
  description: string | null
  status: string
  scheduled_start: string | null
  duration_min: number | null
  equipment_id: string | null
  actual_start: string | null
  actual_end: string | null
  actual_weight: number | null
  theoretical_yield: number | null
  theoretical_bom_snapshot: Record<string, unknown>[] | null
  flow_step_id: string | null
}

export interface UseCookTasksResult {
  tasks: CookTask[]
  isLoading: boolean
  error: string | null
  refetch: () => void
  startTask: (taskId: string) => Promise<{ ok: boolean; error?: string }>
  completeTask: (taskId: string, actualWeight: number) => Promise<{ ok: boolean; error?: string }>
}

export function useCookTasks(): UseCookTasksResult {
  const [tasks, setTasks] = useState<CookTask[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTasks = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('production_tasks')
      .select(
        'id, description, status, scheduled_start, duration_min, equipment_id, actual_start, actual_end, actual_weight, theoretical_yield, theoretical_bom_snapshot, flow_step_id',
      )
      .in('status', ['pending', 'in_progress'])
      .order('scheduled_start', { ascending: true, nullsFirst: false })

    if (fetchError) {
      console.error('[useCookTasks] fetch error', fetchError)
      setError(fetchError.message)
    } else {
      setTasks((data ?? []) as CookTask[])
    }

    setIsLoading(false)
  }, [])

  // Realtime subscription
  useEffect(() => {
    fetchTasks()

    const channel = supabase
      .channel('cook-tasks')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'production_tasks',
        },
        () => {
          fetchTasks()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchTasks])

  const startTask = useCallback(
    async (taskId: string): Promise<{ ok: boolean; error?: string }> => {
      const { data, error: rpcError } = await supabase.rpc(
        'fn_start_production_task',
        { p_task_id: taskId },
      )

      if (rpcError) {
        console.error('[useCookTasks] startTask RPC error', rpcError)
        return { ok: false, error: rpcError.message }
      }

      const result = data as { ok: boolean; error?: string }
      return result
    },
    [],
  )

  const completeTask = useCallback(
    async (
      taskId: string,
      actualWeight: number,
    ): Promise<{ ok: boolean; error?: string }> => {
      const { error: updateError } = await supabase
        .from('production_tasks')
        .update({
          status: 'completed',
          actual_end: new Date().toISOString(),
          actual_weight: actualWeight,
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId)

      if (updateError) {
        console.error('[useCookTasks] completeTask error', updateError)
        return { ok: false, error: updateError.message }
      }

      return { ok: true }
    },
    [],
  )

  return { tasks, isLoading, error, refetch: fetchTasks, startTask, completeTask }
}
