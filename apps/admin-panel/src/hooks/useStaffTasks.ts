import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useCoalescedRealtimeRefetch } from './useCoalescedRealtimeRefetch'

// TaskCategory's source of truth is CATEGORY_META (one entry per category);
// re-exported here so row-shaped types and their consumers keep one import path.
import type { TaskCategory } from '../components/tasks/taskMeta'
export type { TaskCategory }
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low'
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'skipped' | 'cancelled'
export type TaskRecurrence = 'none' | 'daily' | 'weekly'
/** L1 = prep kitchen · L2 = assembly/service · general = shown in both. */
export type TaskStation = 'L1' | 'L2' | 'general'

export interface StaffTask {
  id: string
  title: string
  title_th: string | null
  description: string | null
  description_th: string | null
  assigned_to: string | null
  created_by: string | null
  category: TaskCategory
  priority: TaskPriority
  status: TaskStatus
  station: TaskStation
  due_date: string | null
  due_time: string | null
  reminder_offset_min: number
  recurrence: TaskRecurrence
  recurrence_days: number[] | null
  is_template: boolean
  template_id: string | null
  dm_message_id: string | null
  group_message_id: string | null
  /** Optional photo report(s) — public URLs in the task-photos bucket. */
  photo_urls: string[]
  /** In-app deep link to a relevant tab (recipe, stock sheet, labels…). */
  linked_route: string | null
  linked_label: string | null
  linked_label_th: string | null
  /** Optional deep-link to a Handbook (knowledge base) page — the how-to for this task. */
  kb_page_id: string | null
  kb_page?: { slug: string; translations: { lang: string; title: string }[] } | null
  /** Free-text execution comment/remark (distinct from description/Notes). */
  comment: string | null
  completed_at: string | null
  completed_via: 'telegram' | 'admin' | null
  created_at: string
  updated_at: string
  staff?: { name: string; role: string } | null
}

export interface StaffTaskInsert {
  /** Optional client-supplied id — lets the create form attach photos to the
   *  task's storage folder before the row exists. */
  id?: string
  title: string
  title_th?: string | null
  description?: string | null
  description_th?: string | null
  assigned_to?: string | null
  created_by?: string | null
  category?: TaskCategory
  priority?: TaskPriority
  status?: TaskStatus
  station?: TaskStation
  due_date?: string | null
  due_time?: string | null
  reminder_offset_min?: number
  recurrence?: TaskRecurrence
  recurrence_days?: number[] | null
  is_template?: boolean
  photo_urls?: string[]
  linked_route?: string | null
  linked_label?: string | null
  linked_label_th?: string | null
  kb_page_id?: string | null
  comment?: string | null
}

export type StaffTaskUpdate = Partial<StaffTaskInsert>

const SELECT_COLS =
  'id, title, title_th, description, description_th, assigned_to, created_by, category, priority, status, station, due_date, due_time, reminder_offset_min, recurrence, recurrence_days, is_template, template_id, dm_message_id, group_message_id, photo_urls, linked_route, linked_label, linked_label_th, kb_page_id, kb_page:kb_pages(slug, translations:kb_page_translations(lang, title)), comment, completed_at, completed_via, created_at, updated_at, staff:staff(name, role)'

export interface UseStaffTasksResult {
  tasks: StaffTask[]        // concrete tasks (is_template = false)
  templates: StaffTask[]    // recurring templates (is_template = true)
  isLoading: boolean
  error: string | null
  refetch: () => void
  createTask: (data: StaffTaskInsert) => Promise<StaffTask | null>
  updateTask: (id: string, data: StaffTaskUpdate) => Promise<StaffTask | null>
  setStatus: (id: string, status: TaskStatus) => Promise<StaffTask | null>
  deleteTask: (id: string) => Promise<boolean>
  materializeToday: () => Promise<number>
}

// Keep optimistic inserts/edits in the same order as the fetch query:
// due_date asc (nulls last) → due_time asc (nulls first) → created_at asc.
function sortStaffTasks(list: StaffTask[]): StaffTask[] {
  return [...list].sort((a, b) => {
    if (a.due_date !== b.due_date) {
      if (a.due_date === null) return 1
      if (b.due_date === null) return -1
      return a.due_date < b.due_date ? -1 : 1
    }
    if (a.due_time !== b.due_time) {
      if (a.due_time === null) return -1
      if (b.due_time === null) return 1
      return a.due_time < b.due_time ? -1 : 1
    }
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1
    return 0
  })
}

export function useStaffTasks(): UseStaffTasksResult {
  const [rows, setRows] = useState<StaffTask[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setIsLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('staff_tasks')
      .select(SELECT_COLS)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('due_time', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true })

    if (fetchError) {
      console.error('[useStaffTasks] fetch error', fetchError)
      setError(fetchError.message)
      setIsLoading(false)
      return
    }

    const mapped = (data ?? []).map((row: Record<string, unknown>) => ({
      ...row,
      staff: row.staff as StaffTask['staff'],
    })) as StaffTask[]

    setRows(mapped)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Realtime — Telegram button presses (Phase 2) and other clients reflect live.
  // Coalesced SILENT refetch: no spinner, and one multi-row tx fires once.
  useCoalescedRealtimeRefetch('staff-tasks-realtime', [{ table: 'staff_tasks' }],
    () => { fetchData({ silent: true }) })

  const tasks = useMemo(() => rows.filter((r) => !r.is_template), [rows])
  const templates = useMemo(() => rows.filter((r) => r.is_template), [rows])

  const createTask = useCallback(async (input: StaffTaskInsert): Promise<StaffTask | null> => {
    const { data, error: insertError } = await supabase
      .from('staff_tasks')
      .insert(input)
      .select(SELECT_COLS)
      .single()

    if (insertError) {
      console.error('[useStaffTasks] insert error', insertError)
      setError(insertError.message)
      return null
    }

    // Optimistic insert of the fully-joined row — no full refetch.
    const created = data as unknown as StaffTask
    setRows((prev) => sortStaffTasks([...prev, created]))
    return created
  }, [])

  const updateTask = useCallback(async (id: string, input: StaffTaskUpdate): Promise<StaffTask | null> => {
    const { data, error: updateError } = await supabase
      .from('staff_tasks')
      .update(input)
      .eq('id', id)
      .select(SELECT_COLS)
      .single()

    if (updateError) {
      console.error('[useStaffTasks] update error', updateError)
      setError(updateError.message)
      return null
    }

    // Optimistic merge of the returned row — no full refetch.
    const updated = data as unknown as StaffTask
    setRows((prev) => sortStaffTasks(prev.map((r) => (r.id === id ? updated : r))))
    return updated
  }, [])

  const setStatus = useCallback(async (id: string, status: TaskStatus): Promise<StaffTask | null> => {
    const patch: Record<string, unknown> = { status }
    if (status === 'done') {
      patch.completed_at = new Date().toISOString()
      patch.completed_via = 'admin'
    } else {
      patch.completed_at = null
      patch.completed_via = null
    }

    const { data, error: updateError } = await supabase
      .from('staff_tasks')
      .update(patch)
      .eq('id', id)
      .select(SELECT_COLS)
      .single()

    if (updateError) {
      console.error('[useStaffTasks] setStatus error', updateError)
      setError(updateError.message)
      return null
    }

    // Optimistic merge of the returned row — no full refetch.
    const updated = data as unknown as StaffTask
    setRows((prev) => sortStaffTasks(prev.map((r) => (r.id === id ? updated : r))))
    return updated
  }, [])

  const deleteTask = useCallback(async (id: string): Promise<boolean> => {
    const { error: deleteError } = await supabase
      .from('staff_tasks')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('[useStaffTasks] delete error', deleteError)
      setError(deleteError.message)
      return false
    }

    // Optimistic removal — no full refetch.
    setRows((prev) => prev.filter((r) => r.id !== id))
    return true
  }, [])

  const materializeToday = useCallback(async (): Promise<number> => {
    const { data, error: rpcError } = await supabase.rpc('fn_materialize_recurring_tasks')
    if (rpcError) {
      console.error('[useStaffTasks] materialize error', rpcError)
      setError(rpcError.message)
      return 0
    }
    // Materialize can create many rows at once — a SILENT refetch reconciles
    // without a spinner.
    await fetchData({ silent: true })
    return (data as number) ?? 0
  }, [fetchData])

  return {
    tasks,
    templates,
    isLoading,
    error,
    refetch: fetchData,
    createTask,
    updateTask,
    setStatus,
    deleteTask,
    materializeToday,
  }
}
