import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { ProductionTask } from '../types/tasks'

interface UseCookTasksResult {
  tasks: ProductionTask[]
  isLoading: boolean
  error: string | null
  refetch: () => void
  startTask: (taskId: string) => Promise<{ ok: boolean; error?: string }>
  setGrossWeight: (taskId: string, weight: number) => Promise<{ ok: boolean; error?: string }>
}

export function useCookTasks(cookId: string | null): UseCookTasksResult {
  const [tasks, setTasks] = useState<ProductionTask[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTasks = useCallback(async () => {
    if (!cookId) {
      setTasks([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    const { data, error: fetchErr } = await supabase
      .from('production_tasks')
      .select(`
        id, description, status, scheduled_start, duration_min,
        equipment_id, actual_start, actual_end, actual_weight,
        gross_weight, theoretical_yield, target_nomenclature_id,
        target_quantity, assigned_to, schedule_run_id, parent_target_id,
        target_nomenclature:nomenclature!production_tasks_target_nomenclature_id_fkey(name, product_code)
      `)
      .eq('assigned_to', cookId)
      .in('status', ['pending', 'in_progress'])
      .order('scheduled_start', { ascending: true, nullsFirst: false })

    if (fetchErr) {
      setError(fetchErr.message)
      setIsLoading(false)
      return
    }

    setTasks((data as unknown as ProductionTask[]) ?? [])
    setIsLoading(false)
  }, [cookId])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  const startTask = useCallback(async (taskId: string): Promise<{ ok: boolean; error?: string }> => {
    const { error: rpcErr } = await supabase.rpc('fn_start_production_task', {
      p_task_id: taskId,
    })

    if (rpcErr) return { ok: false, error: rpcErr.message }

    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.id === taskId
        ? { ...t, status: 'in_progress' as const, actual_start: new Date().toISOString() }
        : t
    ))

    return { ok: true }
  }, [])

  const setGrossWeight = useCallback(async (taskId: string, weight: number): Promise<{ ok: boolean; error?: string }> => {
    const { error: upErr } = await supabase
      .from('production_tasks')
      .update({ gross_weight: weight })
      .eq('id', taskId)

    if (upErr) return { ok: false, error: upErr.message }

    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, gross_weight: weight } : t
    ))

    return { ok: true }
  }, [])

  return { tasks, isLoading, error, refetch: fetchTasks, startTask, setGrossWeight }
}
