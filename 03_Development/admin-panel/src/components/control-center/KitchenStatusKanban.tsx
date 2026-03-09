import { RefreshCw } from 'lucide-react'
import type { KitchenTask } from '../../hooks/useKitchenTasks'

interface ColumnConfig {
  key: string
  label: string
  borderColor: string
  badgeColor: string
  dotColor: string
}

const COLUMNS: ColumnConfig[] = [
  {
    key: 'pending',
    label: 'Pending',
    borderColor: 'border-amber-500/30',
    badgeColor: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    dotColor: 'bg-amber-400',
  },
  {
    key: 'in_progress',
    label: 'In Progress',
    borderColor: 'border-blue-500/30',
    badgeColor: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
    dotColor: 'bg-blue-400 animate-pulse',
  },
  {
    key: 'completed',
    label: 'Completed',
    borderColor: 'border-emerald-500/30',
    badgeColor: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    dotColor: 'bg-emerald-400',
  },
]

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-lg border border-slate-800 bg-slate-900/50 p-3">
      <div className="mb-2 h-3 w-3/4 rounded bg-slate-800" />
      <div className="h-2.5 w-1/2 rounded bg-slate-800" />
    </div>
  )
}

function TaskCard({ task, dotColor }: { task: KitchenTask; dotColor: string }) {
  const timeAgo = (() => {
    const diff = Date.now() - new Date(task.updated_at).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  })()

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 transition hover:border-slate-700 hover:bg-slate-900">
      <div className="mb-1.5 flex items-start gap-2">
        <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
        <p className="text-[12px] leading-snug text-slate-200">
          {task.description ?? <span className="italic text-slate-500">No description</span>}
        </p>
      </div>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] text-slate-600">{task.id.slice(0, 8)}…</span>
        <span className="text-[10px] text-slate-500">{timeAgo}</span>
      </div>
    </div>
  )
}

interface KitchenStatusKanbanProps {
  byStatus: Record<string, KitchenTask[]>
  isLoading: boolean
  error: string | null
  onRefresh: () => void
}

export function KitchenStatusKanban({
  byStatus,
  isLoading,
  error,
  onRefresh,
}: KitchenStatusKanbanProps) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/30">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Kitchen Status</h2>
          <p className="text-xs text-slate-500">Live view of production_tasks</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-400 transition hover:border-slate-600 hover:text-slate-200 disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="px-4 py-3 text-xs text-rose-400">
          Error loading tasks: {error}
        </div>
      )}

      {/* Kanban columns */}
      <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const tasks = byStatus[col.key] ?? []
          return (
            <div key={col.key} className={`flex flex-col gap-2`}>
              {/* Column header */}
              <div className={`flex items-center justify-between rounded-lg border ${col.borderColor} bg-slate-900/50 px-3 py-2`}>
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${col.dotColor}`} />
                  <span className="text-xs font-medium text-slate-200">{col.label}</span>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${col.badgeColor}`}>
                  {isLoading ? '–' : tasks.length}
                </span>
              </div>

              {/* Task cards */}
              <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto pr-0.5">
                {isLoading ? (
                  <>
                    <SkeletonCard />
                    <SkeletonCard />
                    <SkeletonCard />
                  </>
                ) : tasks.length === 0 ? (
                  <p className="px-2 py-4 text-center text-[11px] text-slate-600">
                    No {col.label.toLowerCase()} tasks
                  </p>
                ) : (
                  tasks.map((task) => (
                    <TaskCard key={task.id} task={task} dotColor={col.dotColor} />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
