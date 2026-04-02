import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface ShiftTask {
  id: string
  shift_id: string
  production_task_id: string | null
  equipment_id: string | null
  task_description: string | null
  start_time: string
  end_time: string
  priority: number
  status: 'pending' | 'in_progress' | 'done'
  created_at: string
}

export interface ShiftTaskInsert {
  shift_id: string
  production_task_id?: string | null
  equipment_id?: string | null
  task_description?: string | null
  start_time: string
  end_time: string
  priority?: number
  status?: ShiftTask['status']
}

export interface ShiftTaskUpdate {
  production_task_id?: string | null
  equipment_id?: string | null
  task_description?: string | null
  start_time?: string
  end_time?: string
  priority?: number
  status?: ShiftTask['status']
}

export interface UseShiftTasksResult {
  shiftTasks: ShiftTask[]
  isLoading: boolean
  error: string | null
  refetch: () => void
  createShiftTask: (data: ShiftTaskInsert) => Promise<ShiftTask | null>
  updateShiftTask: (id: string, data: ShiftTaskUpdate) => Promise<ShiftTask | null>
  deleteShiftTask: (id: string) => Promise<boolean>
}

export function useShiftTasks(shiftId?: string): UseShiftTasksResult {
  const [shiftTasks, setShiftTasks] = useState<ShiftTask[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    let query = supabase
      .from('shift_tasks')
      .select('id, shift_id, production_task_id, equipment_id, task_description, start_time, end_time, priority, status, created_at')
      .order('start_time', { ascending: true })

    if (shiftId) {
      query = query.eq('shift_id', shiftId)
    }

    const { data, error: fetchError } = await query

    if (fetchError) {
      console.error('[useShiftTasks] fetch error', fetchError)
      setError(fetchError.message)
      setIsLoading(false)
      return
    }

    setShiftTasks((data ?? []) as ShiftTask[])
    setIsLoading(false)
  }, [shiftId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const createShiftTask = useCallback(async (input: ShiftTaskInsert): Promise<ShiftTask | null> => {
    const { data, error: insertError } = await supabase
      .from('shift_tasks')
      .insert(input)
      .select()
      .single()

    if (insertError) {
      console.error('[useShiftTasks] insert error', insertError)
      setError(insertError.message)
      return null
    }

    await fetchData()
    return data as ShiftTask
  }, [fetchData])

  const updateShiftTask = useCallback(async (id: string, input: ShiftTaskUpdate): Promise<ShiftTask | null> => {
    const { data, error: updateError } = await supabase
      .from('shift_tasks')
      .update(input)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('[useShiftTasks] update error', updateError)
      setError(updateError.message)
      return null
    }

    await fetchData()
    return data as ShiftTask
  }, [fetchData])

  const deleteShiftTask = useCallback(async (id: string): Promise<boolean> => {
    const { error: deleteError } = await supabase
      .from('shift_tasks')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('[useShiftTasks] delete error', deleteError)
      setError(deleteError.message)
      return false
    }

    await fetchData()
    return true
  }, [fetchData])

  return {
    shiftTasks,
    isLoading,
    error,
    refetch: fetchData,
    createShiftTask,
    updateShiftTask,
    deleteShiftTask,
  }
}
