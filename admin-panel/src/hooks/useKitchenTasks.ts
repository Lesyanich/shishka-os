import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface KitchenTask {
  id: string
  description: string | null
  status: string
  created_at: string
  updated_at: string
}

export interface TaskCounts {
  pending: number
  in_progress: number
  completed: number
  total: number
}

export interface UseKitchenTasksResult {
  tasks: KitchenTask[]
  byStatus: Record<string, KitchenTask[]>
  counts: TaskCounts
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useKitchenTasks(): UseKitchenTasksResult {
  const [tasks, setTasks] = useState<KitchenTask[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTasks = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('production_tasks')
      .select('id, description, status, created_at, updated_at')
      .order('updated_at', { ascending: false })

    if (fetchError) {
      console.error('[useKitchenTasks] fetch error', fetchError)
      setError(fetchError.message)
    } else {
      setTasks((data ?? []) as KitchenTask[])
    }

    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  const byStatus: Record<string, KitchenTask[]> = {}
  for (const task of tasks) {
    const s = task.status ?? 'unknown'
    if (!byStatus[s]) byStatus[s] = []
    byStatus[s].push(task)
  }

  const counts: TaskCounts = {
    pending: byStatus['pending']?.length ?? 0,
    in_progress: byStatus['in_progress']?.length ?? 0,
    completed: byStatus['completed']?.length ?? 0,
    total: tasks.length,
  }

  return { tasks, byStatus, counts, isLoading, error, refetch: fetchTasks }
}
