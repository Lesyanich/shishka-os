import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { BusinessTask, TaskStatus } from '../../hooks/useBusinessTasks'
import {
  type GroupBy,
  deriveTopicGroups,
  deriveAgentGroups,
  statusBreakdown,
  sortedGroups,
} from '../../utils/taskGrouping'

const STATUS_DOT_COLORS: Record<TaskStatus, string> = {
  inbox: 'bg-slate-400',
  backlog: 'bg-blue-400',
  in_progress: 'bg-amber-400',
  blocked: 'bg-red-400',
  done: 'bg-emerald-400',
  cancelled: 'bg-slate-600',
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  inbox: 'inbox',
  backlog: 'backlog',
  in_progress: 'in progress',
  blocked: 'blocked',
  done: 'done',
  cancelled: 'cancelled',
}

function StatusBreakdownBadges({ tasks }: { tasks: BusinessTask[] }) {
  const breakdown = statusBreakdown(tasks)
  const entries = (Object.entries(breakdown) as [TaskStatus, number][]).filter(
    ([, count]) => count > 0,
  )
  if (entries.length === 0) return null

  return (
    <span className="flex items-center gap-2 text-[10px] text-slate-500">
      {entries.map(([status, count]) => (
        <span key={status} className="inline-flex items-center gap-1">
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT_COLORS[status]}`} />
          {count} {STATUS_LABELS[status]}
        </span>
      ))}
    </span>
  )
}

function GroupSection({
  groupKey,
  tasks,
  renderItem,
  defaultExpanded,
}: {
  groupKey: string
  tasks: BusinessTask[]
  renderItem: (task: BusinessTask) => React.ReactNode
  defaultExpanded: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const Icon = expanded ? ChevronDown : ChevronRight

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-slate-800/40 transition"
      >
        <Icon className="h-4 w-4 text-slate-500 shrink-0" />
        <span className="text-sm font-medium text-slate-200 capitalize">{groupKey}</span>
        <span className="rounded-full bg-slate-700 px-1.5 text-[10px] text-slate-300">
          {tasks.length}
        </span>
        <StatusBreakdownBadges tasks={tasks} />
      </button>
      {expanded && (
        <div className="space-y-2 pl-2 pt-1">{tasks.map((task) => renderItem(task))}</div>
      )}
    </div>
  )
}

export function GroupedTaskList({
  tasks,
  groupBy,
  renderItem,
}: {
  tasks: BusinessTask[]
  groupBy: GroupBy
  renderItem: (task: BusinessTask) => React.ReactNode
}) {
  const groups = useMemo(() => {
    if (groupBy === 'none') return null
    const raw = groupBy === 'topic' ? deriveTopicGroups(tasks) : deriveAgentGroups(tasks)
    return sortedGroups(raw)
  }, [tasks, groupBy])

  if (groupBy === 'none' || !groups) {
    return (
      <div className="space-y-2">
        {tasks.map((task) => renderItem(task))}
      </div>
    )
  }

  if (tasks.length === 0) {
    return <p className="py-10 text-center text-sm text-slate-600">No tasks match this filter</p>
  }

  return (
    <div className="space-y-3">
      {groups.map(([key, groupTasks]) => (
        <GroupSection
          key={key}
          groupKey={key}
          tasks={groupTasks}
          renderItem={renderItem}
          defaultExpanded
        />
      ))}
    </div>
  )
}
