import { CheckCircle2, Circle, Clock, AlertTriangle, ShieldAlert } from 'lucide-react'
import type { RoadmapTask } from '../../hooks/useOpeningRoadmap'

/* ─── Status icon mapping ─── */

const STATUS_ICON: Record<
  string,
  { icon: typeof CheckCircle2; className: string }
> = {
  done: { icon: CheckCircle2, className: 'text-emerald-400' },
  in_progress: { icon: Clock, className: 'text-amber-400' },
  blocked: { icon: AlertTriangle, className: 'text-red-400' },
  inbox: { icon: Circle, className: 'text-zinc-600' },
  backlog: { icon: Circle, className: 'text-zinc-600' },
}

/* ─── Priority badge — only for critical / high ─── */

function PriorityBadge({ priority }: { priority: string }) {
  if (priority === 'critical') {
    return (
      <span className="inline-flex items-center rounded-md bg-red-950/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-300 ring-1 ring-red-800/40">
        critical
      </span>
    )
  }
  if (priority === 'high') {
    return (
      <span className="inline-flex items-center rounded-md bg-amber-950/50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300 ring-1 ring-amber-800/40">
        high
      </span>
    )
  }
  return null
}

/* ─── Component ─── */

interface RoadmapTaskRowProps {
  task: RoadmapTask
}

export function RoadmapTaskRow({ task }: RoadmapTaskRowProps) {
  const statusEntry = STATUS_ICON[task.status] ?? STATUS_ICON.inbox
  const StatusIcon = statusEntry.icon

  const isDone = task.status === 'done'

  return (
    <div
      className={[
        'group flex items-center gap-3 rounded-lg px-3 py-2 transition-colors',
        isDone
          ? 'opacity-60'
          : 'hover:bg-zinc-800/40',
      ].join(' ')}
    >
      {/* Status icon */}
      <StatusIcon className={`h-4 w-4 shrink-0 ${statusEntry.className}`} />

      {/* Title */}
      <span
        className={[
          'min-w-0 flex-1 truncate text-sm',
          isDone
            ? 'text-zinc-500 line-through decoration-zinc-700'
            : 'text-zinc-200',
        ].join(' ')}
      >
        {task.title}
      </span>

      {/* Badges */}
      <div className="flex shrink-0 items-center gap-1.5">
        <PriorityBadge priority={task.priority} />

        {task.isBlocker && task.status !== 'done' && (
          <span className="inline-flex items-center gap-1 rounded-md bg-red-900/50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-300 ring-1 ring-red-800/50">
            <ShieldAlert className="h-3 w-3" />
            blocker
          </span>
        )}
      </div>
    </div>
  )
}
