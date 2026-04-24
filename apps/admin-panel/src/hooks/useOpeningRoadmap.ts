import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  INITIATIVE_ID,
  OPENING_PHASES,
  POLL_INTERVAL_MS,
  type TaskStatus,
} from '../components/roadmap/roadmap-config'
import {
  deriveBlockers,
  deriveMustDo,
  derivePhaseStatus,
  inferOwner,
  parsePhaseTag,
  type MustDoSummary,
  type PhaseData,
  type RoadmapBlocker,
  type RoadmapTask,
} from './useOpeningRoadmap.helpers'

// Re-export pure helpers + types so existing imports keep working.
export {
  daysSince,
  deriveBlockers,
  deriveMustDo,
  derivePhaseStatus,
  inferOwner,
  parsePhaseTag,
  type MustDoSummary,
  type PhaseData,
  type RoadmapBlocker,
  type RoadmapTask,
  type TaskOwner,
} from './useOpeningRoadmap.helpers'

export interface UseOpeningRoadmapResult {
  phases: PhaseData[]
  unassignedTasks: RoadmapTask[]
  overallProgress: number
  totalBlockers: number
  blockers: RoadmapBlocker[]
  mustDo: MustDoSummary
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useOpeningRoadmap(): UseOpeningRoadmapResult {
  const [allTasks, setAllTasks] = useState<RoadmapTask[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchTasks = useCallback(async () => {
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('business_tasks')
      .select(
        'id, title, description, status, priority, tags, due_date, assigned_to, updated_at',
      )
      .eq('parent_task_id', INITIATIVE_ID)
      .not('status', 'eq', 'cancelled')

    if (fetchError) {
      console.error('[useOpeningRoadmap] fetch error', fetchError)
      setError(fetchError.message)
      setIsLoading(false)
      return
    }

    const mapped: RoadmapTask[] = (data ?? []).map((row) => {
      const tags: string[] = Array.isArray(row.tags) ? row.tags : []
      const phase = parsePhaseTag(tags)
      const assignedRaw = (row.assigned_to as string | null) ?? null
      return {
        id: row.id as string,
        title: row.title as string,
        description: (row.description as string | null) ?? null,
        status: (row.status ?? 'inbox') as TaskStatus,
        priority: (row.priority ?? 'medium') as RoadmapTask['priority'],
        isBlocker: tags.includes('opening-blocker'),
        phase: phase ?? -1,
        owner: inferOwner(assignedRaw),
        assignedRaw,
        due_date: (row.due_date as string) ?? null,
        updated_at: (row.updated_at as string) ?? null,
      }
    })

    setAllTasks(mapped)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchTasks()
    timerRef.current = setInterval(fetchTasks, POLL_INTERVAL_MS)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [fetchTasks])

  return useMemo(() => {
    const unassignedTasks = allTasks.filter((t) => t.phase === -1)

    const phases: PhaseData[] = OPENING_PHASES.map((config) => {
      const tasks = allTasks.filter((t) => t.phase === config.id)
      const doneCount = tasks.filter((t) => t.status === 'done').length
      const progress =
        tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0
      const blockerCount = tasks.filter(
        (t) => t.isBlocker && t.status !== 'done',
      ).length

      return {
        config,
        tasks,
        progress,
        blockerCount,
        status: derivePhaseStatus(tasks),
      }
    })

    const totalTasks = allTasks.filter((t) => t.phase !== -1).length
    const totalDone = allTasks.filter(
      (t) => t.phase !== -1 && t.status === 'done',
    ).length
    const overallProgress =
      totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0

    const blockers = deriveBlockers(allTasks)
    const mustDo = deriveMustDo(allTasks)

    return {
      phases,
      unassignedTasks,
      overallProgress,
      totalBlockers: blockers.length,
      blockers,
      mustDo,
      isLoading,
      error,
      refetch: fetchTasks,
    }
  }, [allTasks, isLoading, error, fetchTasks])
}
