import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// ── Types matching 091_business_tasks.sql ──

export type TaskDomain =
  | 'kitchen'
  | 'procurement'
  | 'finance'
  | 'marketing'
  | 'ops'
  | 'sales'
  | 'strategy'
  | 'tech'

export type TaskStatus =
  | 'inbox'
  | 'backlog'
  | 'in_progress'
  | 'blocked'
  | 'done'
  | 'cancelled'

export type TaskPriority = 'critical' | 'high' | 'medium' | 'low'

export type ExecutorType = 'human' | 'code' | 'agent'

export interface BusinessTask {
  id: string
  title: string
  description: string | null
  domain: TaskDomain
  status: TaskStatus
  priority: TaskPriority
  executor_type: ExecutorType
  initiative_id: string | null
  parent_task_id: string | null
  source: string | null
  created_by: string | null
  assigned_to: string | null
  due_date: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
  tags: string[]
  related_ids: Record<string, unknown>
  notes: string | null
  sprint_id: string | null
  story_points: number | null
}

export interface NewBusinessTask {
  title: string
  domain: TaskDomain
  priority: TaskPriority
  description?: string
  assigned_to?: string
  due_date?: string
  source?: string
  created_by?: string
}

export interface UseBusinessTasksResult {
  tasks: BusinessTask[]
  isLoading: boolean
  error: string | null
  refetch: () => void
  addTask: (task: NewBusinessTask) => Promise<boolean>
  updateTask: (id: string, updates: Partial<BusinessTask>) => Promise<boolean>
}

export function useBusinessTasks(domainFilter?: TaskDomain | 'all'): UseBusinessTasksResult {
  const [tasks, setTasks] = useState<BusinessTask[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTasks = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    let query = supabase
      .from('business_tasks')
      .select('*')
      .not('status', 'eq', 'cancelled')
      .order('updated_at', { ascending: false })

    if (domainFilter && domainFilter !== 'all') {
      query = query.eq('domain', domainFilter)
    }

    const { data, error: fetchError } = await query

    if (fetchError) {
      console.error('[useBusinessTasks] fetch error', fetchError)
      setError(fetchError.message)
    } else {
      setTasks((data ?? []) as BusinessTask[])
    }

    setIsLoading(false)
  }, [domainFilter])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  const addTask = useCallback(async (task: NewBusinessTask): Promise<boolean> => {
    const { error: insertError } = await supabase
      .from('business_tasks')
      .insert({
        ...task,
        status: 'inbox' as TaskStatus,
        created_by: task.created_by ?? 'lesia',
        source: task.source ?? 'owner',
      })

    if (insertError) {
      console.error('[useBusinessTasks] insert error', insertError)
      setError(insertError.message)
      return false
    }

    await fetchTasks()
    return true
  }, [fetchTasks])

  const updateTask = useCallback(async (id: string, updates: Partial<BusinessTask>): Promise<boolean> => {
    const { error: updateError } = await supabase
      .from('business_tasks')
      .update(updates)
      .eq('id', id)

    if (updateError) {
      console.error('[useBusinessTasks] update error', updateError)
      setError(updateError.message)
      return false
    }

    await fetchTasks()
    return true
  }, [fetchTasks])

  return { tasks, isLoading, error, refetch: fetchTasks, addTask, updateTask }
}
