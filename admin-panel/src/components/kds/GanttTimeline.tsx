import type { GanttTask, GanttConflict } from '../../hooks/useGanttTasks'
import type { EquipmentItem } from '../../hooks/useEquipmentCategories'
import { TimeHeader } from './TimeHeader'
import { GanttRow } from './GanttRow'
import { AlertTriangle } from 'lucide-react'

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

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
      {/* Conflict banner */}
      {conflicts.length > 0 && (
        <div className="flex items-center gap-2 border-b border-rose-500/30 bg-rose-500/10 px-4 py-2">
          <AlertTriangle className="h-4 w-4 text-rose-400" />
          <span className="text-xs font-medium text-rose-300">
            {conflicts.length} scheduling conflict{conflicts.length > 1 ? 's' : ''} detected
          </span>
        </div>
      )}

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

      {/* Empty state */}
      {tasks.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-sm text-slate-500">No scheduled tasks for today</p>
          <p className="text-xs text-slate-600">
            Assign scheduled_start and equipment to tasks to see them here
          </p>
        </div>
      )}
    </div>
  )
}
