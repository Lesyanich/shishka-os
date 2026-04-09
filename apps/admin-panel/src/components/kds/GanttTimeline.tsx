import { useState, useEffect } from 'react'
import type { GanttTask, GanttConflict } from '../../hooks/useGanttTasks'
import type { EquipmentItem } from '../../hooks/useEquipmentCategories'
import { TimeHeader } from './TimeHeader'
import { GanttRow } from './GanttRow'
import { AlertTriangle, Clock, Wrench, ChevronDown, ChevronUp } from 'lucide-react'

function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < breakpoint)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [breakpoint])
  return isMobile
}

interface GanttTimelineProps {
  tasks: GanttTask[]
  equipment: EquipmentItem[]
  conflicts: GanttConflict[]
  isLoading: boolean
  error: string | null
}

export function GanttTimeline({
  tasks,
  equipment,
  conflicts,
  isLoading,
  error,
}: GanttTimelineProps) {
  const isMobile = useIsMobile()
  const [showConflictDetails, setShowConflictDetails] = useState(false)

  // Day start = today 00:00 local
  const now = new Date()
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dayStartMs = dayStart.getTime()

  // Group tasks by equipment_id
  const tasksByEquipment: Record<string, GanttTask[]> = {}
  for (const t of tasks) {
    const eqId = t.equipment_id ?? '__unassigned'
    if (!tasksByEquipment[eqId]) tasksByEquipment[eqId] = []
    tasksByEquipment[eqId].push(t)
  }

  // Filter equipment to only those with tasks or all if no tasks
  const activeEquipment = equipment.filter(
    (eq) => tasksByEquipment[eq.id]?.length,
  )
  const displayEquipment = activeEquipment.length > 0 ? activeEquipment : equipment.slice(0, 5)

  // Build task name lookup for conflict details
  const taskNameMap = new Map<string, string>()
  for (const t of tasks) {
    taskNameMap.set(t.id, t.target_nomenclature?.name ?? t.description ?? t.id.slice(0, 8))
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-6 text-center text-sm text-rose-300">
        Failed to load Gantt: {error}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-slate-800/50" />
        ))}
      </div>
    )
  }

  // Conflict banner with expandable details
  const conflictBanner = conflicts.length > 0 && (
    <div className="border-b border-rose-500/30 bg-rose-500/10">
      <button
        type="button"
        onClick={() => setShowConflictDetails(!showConflictDetails)}
        className="flex w-full items-center gap-2 px-4 py-2"
      >
        <AlertTriangle className="h-4 w-4 text-rose-400" />
        <span className="flex-1 text-left text-xs font-medium text-rose-300">
          {conflicts.length} scheduling conflict{conflicts.length > 1 ? 's' : ''} detected
        </span>
        {showConflictDetails
          ? <ChevronUp className="h-3.5 w-3.5 text-rose-400" />
          : <ChevronDown className="h-3.5 w-3.5 text-rose-400" />}
      </button>
      {showConflictDetails && (
        <div className="space-y-1 px-4 pb-2">
          {conflicts.map((c, i) => {
            const eqName = equipment.find((e) => e.id === c.equipment_id)?.name ?? 'Unknown'
            return (
              <div key={i} className="flex items-center gap-2 rounded bg-rose-500/5 px-2 py-1.5 text-[11px]">
                <Wrench className="h-3 w-3 shrink-0 text-rose-400" />
                <span className="text-rose-200">{eqName}:</span>
                <span className="text-slate-300 truncate">
                  {taskNameMap.get(c.taskA) ?? '?'} / {taskNameMap.get(c.taskB) ?? '?'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  // Empty state (shared)
  const emptyState = tasks.length === 0 && (
    <div className="py-12 text-center">
      <p className="text-sm text-slate-500">No scheduled tasks for today</p>
      <p className="text-xs text-slate-600">
        Assign scheduled_start and equipment to tasks to see them here
      </p>
    </div>
  )

  // Mobile: vertical task list grouped by equipment
  if (isMobile) {
    const conflictTaskIds = new Set(
      conflicts.flatMap((c) => [c.taskA, c.taskB]),
    )
    return (
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
        {conflictBanner}
        {displayEquipment.map((eq) => {
          // SQL filters scheduled_start NOT NULL but the type is nullable; narrow with a runtime guard.
          const eqTasks = (tasksByEquipment[eq.id] ?? [])
            .filter((t): t is GanttTask & { scheduled_start: string } => t.scheduled_start !== null)
            .sort(
              (a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime(),
            )
          if (eqTasks.length === 0) return null
          return (
            <div key={eq.id} className="border-b border-slate-800 last:border-b-0">
              <div className="flex items-center gap-2 bg-slate-800/30 px-3 py-2">
                <Wrench className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-xs font-medium text-slate-200">{eq.name}</span>
                <span className="text-[10px] text-slate-500">{eq.category}</span>
              </div>
              <div className="divide-y divide-slate-800/50">
                {eqTasks.map((task) => {
                  const start = new Date(task.scheduled_start)
                  const end = new Date(start.getTime() + (task.duration_min ?? 0) * 60_000)
                  const fmt = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                  const isConflict = conflictTaskIds.has(task.id)
                  return (
                    <div
                      key={task.id}
                      className={`flex items-center gap-3 px-3 py-2.5 ${isConflict ? 'bg-rose-500/5' : ''}`}
                    >
                      <div className="flex items-center gap-1 text-xs text-slate-400 shrink-0">
                        <Clock className="h-3 w-3" />
                        <span>{fmt(start)}–{fmt(end)}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-200 truncate">{task.target_nomenclature?.name ?? 'Task'}</p>
                        {task.description && (
                          <p className="text-[11px] text-slate-500 truncate">{task.description}</p>
                        )}
                      </div>
                      {isConflict && (
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
        {emptyState}
      </div>
    )
  }

  // Desktop/tablet: Gantt chart
  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
      {conflictBanner}

      {/* Time header */}
      <div className="flex">
        <div className="w-36 shrink-0 border-r border-slate-700 lg:w-48" />
        <div className="flex-1">
          <TimeHeader />
        </div>
      </div>

      {/* Equipment rows */}
      {displayEquipment.map((eq) => (
        <GanttRow
          key={eq.id}
          equipment={eq}
          tasks={tasksByEquipment[eq.id] ?? []}
          conflicts={conflicts.filter(
            (c) => c.equipment_id === eq.id,
          )}
          dayStartMs={dayStartMs}
        />
      ))}

      {emptyState}
    </div>
  )
}
