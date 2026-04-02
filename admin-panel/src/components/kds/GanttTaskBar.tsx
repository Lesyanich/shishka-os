import type { GanttTask, GanttConflict } from '../../hooks/useGanttTasks'

interface GanttTaskBarProps {
  task: GanttTask
  dayStartMs: number
  isConflict: boolean
  conflicts: GanttConflict[]
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-500/30 border-amber-500/50 text-amber-200',
  in_progress: 'bg-sky-500/30 border-sky-500/50 text-sky-200',
  completed: 'bg-emerald-500/30 border-emerald-500/50 text-emerald-200',
}

export function GanttTaskBar({ task, dayStartMs, isConflict, conflicts }: GanttTaskBarProps) {
  const startMs = new Date(task.scheduled_start!).getTime()
  const durationMs = (task.duration_min ?? 0) * 60_000
  const dayMs = 24 * 60 * 60_000

  const leftPct = ((startMs - dayStartMs) / dayMs) * 100
  const widthPct = (durationMs / dayMs) * 100

  // Clamp to visible range
  const clampedLeft = Math.max(0, Math.min(leftPct, 100))
  const clampedWidth = Math.max(0.3, Math.min(widthPct, 100 - clampedLeft))

  const colorClass = STATUS_COLORS[task.status] ?? STATUS_COLORS.pending
  const conflictOverlap = conflicts.find(
    (c) => c.taskA === task.id || c.taskB === task.id,
  )

  return (
    <div
      className={[
        'absolute top-1 bottom-1 flex items-center overflow-hidden rounded border px-1.5 text-[10px] font-medium',
        colorClass,
        isConflict ? 'ring-2 ring-rose-500/60' : '',
      ].join(' ')}
      style={{
        left: `${clampedLeft}%`,
        width: `${clampedWidth}%`,
        minWidth: '24px',
      }}
      title={[
        task.target_nomenclature?.name ?? task.description ?? 'Task',
        task.target_quantity ? `Target: ${task.target_quantity} kg` : '',
        `Status: ${task.status}`,
        task.duration_min ? `${task.duration_min} min` : '',
        conflictOverlap ? `Conflict: ${conflictOverlap.overlapMin} min overlap` : '',
      ]
        .filter(Boolean)
        .join('\n')}
    >
      <span className="truncate">
        {task.target_nomenclature?.name ?? task.description ?? task.id.slice(0, 8)}
      </span>
    </div>
  )
}
