import type { RoadmapTask } from '../../hooks/useOpeningRoadmap'
import { RoadmapTaskRow } from './RoadmapTaskRow'

interface PhaseTaskListProps {
  tasks: RoadmapTask[]
}

/** Sorts tasks: blockers first, then by status priority, then alphabetically */
function sortTasks(tasks: RoadmapTask[]): RoadmapTask[] {
  const STATUS_ORDER: Record<string, number> = {
    blocked: 0,
    in_progress: 1,
    inbox: 2,
    backlog: 3,
    done: 4,
  }

  return [...tasks].sort((a, b) => {
    // Active blockers float to top
    const aBlocker = a.isBlocker && a.status !== 'done' ? 0 : 1
    const bBlocker = b.isBlocker && b.status !== 'done' ? 0 : 1
    if (aBlocker !== bBlocker) return aBlocker - bBlocker

    // Then by status
    const aOrder = STATUS_ORDER[a.status] ?? 3
    const bOrder = STATUS_ORDER[b.status] ?? 3
    if (aOrder !== bOrder) return aOrder - bOrder

    // Then alphabetically
    return a.title.localeCompare(b.title)
  })
}

export function PhaseTaskList({ tasks }: PhaseTaskListProps) {
  if (tasks.length === 0) {
    return (
      <div className="px-3 py-4 text-center text-xs text-zinc-600">
        No tasks assigned to this phase yet
      </div>
    )
  }

  const sorted = sortTasks(tasks)

  return (
    <div className="flex flex-col gap-0.5 pb-2 pt-1">
      {sorted.map((task) => (
        <RoadmapTaskRow key={task.id} task={task} />
      ))}
    </div>
  )
}
