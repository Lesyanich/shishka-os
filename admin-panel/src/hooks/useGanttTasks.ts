import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface GanttTask {
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
  target_nomenclature_id: string | null
  target_quantity: number | null
  target_nomenclature: { name: string; product_code: string } | null
}

export interface GanttConflict {
  taskA: string
  taskB: string
  equipment_id: string
  overlapMin: number
}

function detectConflicts(tasks: GanttTask[]): GanttConflict[] {
  const conflicts: GanttConflict[] = []
  const byEquipment: Record<string, GanttTask[]> = {}

  for (const t of tasks) {
    if (!t.equipment_id || !t.scheduled_start || !t.duration_min) continue
    if (!byEquipment[t.equipment_id]) byEquipment[t.equipment_id] = []
    byEquipment[t.equipment_id].push(t)
  }

  for (const eqId of Object.keys(byEquipment)) {
    const group = byEquipment[eqId].sort(
      (a, b) =>
        new Date(a.scheduled_start!).getTime() -
        new Date(b.scheduled_start!).getTime(),
    )

    for (let i = 0; i < group.length; i++) {
      const a = group[i]
      const aStart = new Date(a.scheduled_start!).getTime()
      const aEnd = aStart + a.duration_min! * 60_000

      for (let j = i + 1; j < group.length; j++) {
        const b = group[j]
        const bStart = new Date(b.scheduled_start!).getTime()
        if (bStart >= aEnd) break // sorted, no more overlaps

        const bEnd = bStart + b.duration_min! * 60_000
        const overlapEnd = Math.min(aEnd, bEnd)
        const overlapMin = Math.round((overlapEnd - bStart) / 60_000)

        conflicts.push({
          taskA: a.id,
          taskB: b.id,
          equipment_id: eqId,
          overlapMin,
        })
      }
    }
  }

  return conflicts
}

export interface UseGanttTasksResult {
  tasks: GanttTask[]
  conflicts: GanttConflict[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useGanttTasks(): UseGanttTasksResult {
  const [tasks, setTasks] = useState<GanttTask[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTasks = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('production_tasks')
      .select(
        'id, description, status, scheduled_start, duration_min, equipment_id, actual_start, actual_end, actual_weight, theoretical_yield, target_nomenclature_id, target_quantity, nomenclature!target_nomenclature_id(name, product_code)',
      )
      .not('scheduled_start', 'is', null)
      .order('scheduled_start', { ascending: true })

    if (fetchError) {
      console.error('[useGanttTasks] fetch error', fetchError)
      setError(fetchError.message)
    } else {
      const mapped = (data ?? []).map((row: Record<string, unknown>) => ({
        ...row,
        target_nomenclature: row.nomenclature as { name: string; product_code: string } | null,
        nomenclature: undefined,
      })) as unknown as GanttTask[]
      setTasks(mapped)
    }

    setIsLoading(false)
  }, [])

  // Supabase Realtime subscription
  useEffect(() => {
    fetchTasks()

    const channel = supabase
      .channel('gantt-tasks')
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

  const conflicts = detectConflicts(tasks)

  return { tasks, conflicts, isLoading, error, refetch: fetchTasks }
}
