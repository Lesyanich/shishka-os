import { Flame, Snowflake } from 'lucide-react'
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

  const conflictOverlap = conflicts.find(
    (c) => c.taskA === task.id || c.taskB === task.id,
  )

  // Preheat/defrost override styles
  const isPreheat = task.is_preheat === true
  const isDefrost = task.is_defrost === true

  let colorClass = STATUS_COLORS[task.status] ?? STATUS_COLORS.pending
  let extraClasses = ''

  if (isPreheat) {
    colorClass = 'bg-orange-500/20 border-orange-500/60 text-orange-200'
    extraClasses = 'border-dashed'
  } else if (isDefrost) {
    colorClass = 'bg-cyan-500/30 border-cyan-500/50 text-cyan-200'
  }

  return (
    <div
      className={[
        'absolute top-1 bottom-1 flex items-center gap-1 overflow-hidden rounded border px-1.5 text-[10px] font-medium',
        colorClass,
        extraClasses,
        isConflict ? 'ring-2 ring-rose-500/60' : '',
      ].join(' ')}
      style={{
        left: `${clampedLeft}%`,
        width: `${clampedWidth}%`,
        minWidth: '24px',
      }}
      title={[
        task.target_nomenclature?.name ?? task.description ?? 'Task',
        isPreheat ? 'Preheat task' : '',
        isDefrost ? 'Defrost task' : '',
        task.target_quantity ? `Target: ${task.target_quantity} kg` : '',
        `Status: ${task.status}`,
        task.duration_min ? `${task.duration_min} min` : '',
        conflictOverlap ? `Conflict: ${conflictOverlap.overlapMin} min overlap` : '',
      ]
        .filter(Boolean)
        .join('\n')}
    >
      {isPreheat && <Flame className="h-2.5 w-2.5 shrink-0" />}
      {isDefrost && <Snowflake className="h-2.5 w-2.5 shrink-0" />}
      <span className="truncate">
        {task.target_nomenclature?.name ?? task.description ?? task.id.slice(0, 8)}
      </span>
    </div>
  )
}
