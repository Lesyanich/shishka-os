import type { GanttTask, GanttConflict } from '../../hooks/useGanttTasks'
import type { EquipmentItem } from '../../hooks/useEquipmentCategories'
import { GanttTaskBar } from './GanttTaskBar'

interface GanttRowProps {
  equipment: EquipmentItem
  tasks: GanttTask[]
  conflicts: GanttConflict[]
  dayStartMs: number
}

export function GanttRow({ equipment, tasks, conflicts, dayStartMs }: GanttRowProps) {
  const conflictTaskIds = new Set(
    conflicts.flatMap((c) => [c.taskA, c.taskB]),
  )

  return (
    <div className="flex border-b border-slate-800">
      {/* Equipment label */}
      <div className="flex w-36 shrink-0 items-center border-r border-slate-800 px-3 py-2 lg:w-48">
        <div>
          <p className="truncate text-xs font-medium text-slate-200">
            {equipment.name}
          </p>
          <p className="text-[10px] text-slate-500">
            {equipment.category ?? 'Uncategorized'}
          </p>
        </div>
      </div>

      {/* Timeline area */}
      <div className="relative min-h-[40px] flex-1">
        {/* Hour gridlines */}
        {Array.from({ length: 24 }, (_, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 border-r border-slate-800/50"
            style={{ left: `${(i / 24) * 100}%` }}
          />
        ))}

        {/* Task bars */}
        {tasks.map((task) => (
          <GanttTaskBar
            key={task.id}
            task={task}
            dayStartMs={dayStartMs}
            isConflict={conflictTaskIds.has(task.id)}
            conflicts={conflicts}
          />
        ))}

        {/* Empty state */}
        {tasks.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <span className="text-[10px] text-slate-700">No tasks</span>
          </div>
        )}
      </div>
    </div>
  )
}
