import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  INITIATIVE_ID,
  OPENING_PHASES,
  POLL_INTERVAL_MS,
  type PhaseStatus,
  type TaskStatus,
} from '../components/roadmap/roadmap-config'

/* ─── Types ─── */

export interface RoadmapTask {
  id: string
  title: string
  status: TaskStatus
  priority: 'critical' | 'high' | 'medium' | 'low'
  isBlocker: boolean
  phase: number // 0-5, derived from phase-N tag
  due_date: string | null
}

export interface PhaseData {
  config: (typeof OPENING_PHASES)[number]
  tasks: RoadmapTask[]
  progress: number // 0-100
  blockerCount: number
  status: PhaseStatus
}

export interface UseOpeningRoadmapResult {
  phases: PhaseData[]
  unassignedTasks: RoadmapTask[]
  overallProgress: number
  totalBlockers: number
  isLoading: boolean
  error: string | null
  refetch: () => void
}

/* ─── Helpers ─── */

const PHASE_TAG_RE = /^phase-(\d)$/

function parsePhaseTag(tags: string[] | null): number | null {
  if (!tags) return null
  for (const tag of tags) {
    const match = PHASE_TAG_RE.exec(tag)
    if (match) return Number(match[1])
  }
  return null
}

function derivePhaseStatus(tasks: RoadmapTask[]): PhaseStatus {
  if (tasks.length === 0) return 'not_started'
  const allDone = tasks.every((t) => t.status === 'done')
  if (allDone) return 'done'
  const hasBlocker = tasks.some(
    (t) => t.isBlocker && t.status !== 'done',
  )
  if (hasBlocker) return 'blocked'
  const hasActive = tasks.some(
    (t) => t.status === 'in_progress' || t.status === 'done',
  )
  return hasActive ? 'in_progress' : 'not_started'
}

/* ─── Hook ─── */

export function useOpeningRoadmap(): UseOpeningRoadmapResult {
  const [allTasks, setAllTasks] = useState<RoadmapTask[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchTasks = useCallback(async () => {
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('business_tasks')
      .select('id, title, status, priority, tags, due_date')
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
      return {
        id: row.id as string,
        title: row.title as string,
        status: (row.status ?? 'inbox') as TaskStatus,
        priority: (row.priority ?? 'medium') as RoadmapTask['priority'],
        isBlocker: tags.includes('opening-blocker'),
        phase: phase ?? -1, // -1 = unassigned
        due_date: (row.due_date as string) ?? null,
      }
    })

    setAllTasks(mapped)
    setIsLoading(false)
  }, [])

  // Initial fetch + polling
  useEffect(() => {
    fetchTasks()
    timerRef.current = setInterval(fetchTasks, POLL_INTERVAL_MS)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [fetchTasks])

  // Derive phase data
  const unassignedTasks = allTasks.filter((t) => t.phase === -1)

  const phases: PhaseData[] = OPENING_PHASES.map((config) => {
    const tasks = allTasks.filter((t) => t.phase === config.id)
    const doneCount = tasks.filter((t) => t.status === 'done').length
    const progress = tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0
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

  const totalBlockers = phases.reduce((sum, p) => sum + p.blockerCount, 0)

  return {
    phases,
    unassignedTasks,
    overallProgress,
    totalBlockers,
    isLoading,
    error,
    refetch: fetchTasks,
  }
}
