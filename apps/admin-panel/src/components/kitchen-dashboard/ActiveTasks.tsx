import { useCallback, useState } from 'react'
import { ClipboardList, Play, CheckCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { DashboardShiftTask } from '../../hooks/useKitchenDashboard'

interface ActiveTasksProps {
  tasks: DashboardShiftTask[]
  onRefetch: () => void
}

export function ActiveTasks({ tasks, onRefetch }: ActiveTasksProps) {
  const [updating, setUpdating] = useState<string | null>(null)

  const activeTasks = tasks.filter((t) => t.status === 'in_progress')
  const pendingTasks = tasks.filter((t) => t.status === 'pending')
  const sortedTasks = [...activeTasks, ...pendingTasks]

  const updateStatus = useCallback(
    async (taskId: string, newStatus: 'in_progress' | 'done') => {
      setUpdating(taskId)
      const { error } = await supabase
        .from('shift_tasks')
        .update({ status: newStatus })
        .eq('id', taskId)

      if (error) {
        console.error('[ActiveTasks] update error', error)
      }
      onRefetch()
      setUpdating(null)
    },
    [onRefetch],
  )

  if (sortedTasks.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-100">
          <ClipboardList className="h-5 w-5 text-sky-400" />
          Tasks
        </h2>
        <p className="text-base text-slate-500">No active tasks</p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-100">
        <ClipboardList className="h-5 w-5 text-sky-400" />
        Tasks
        <span className="ml-auto text-sm text-slate-500">
          {activeTasks.length} / {sortedTasks.length}
        </span>
      </h2>
      <div className="space-y-2">
        {sortedTasks.map((task) => {
          const isActive = task.status === 'in_progress'
          const staffName = task.shift?.staff?.name ?? '—'
          const eqName = task.equipment?.name
          const isUpdating = updating === task.id

          return (
            <div
              key={task.id}
              className={`rounded-xl px-3 py-3 ${
                isActive
                  ? 'border border-emerald-500/30 bg-emerald-500/5'
                  : 'bg-slate-800/60'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-base font-medium text-slate-100">
                    {task.task_description ?? 'No description'}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-400">
                    {task.start_time.slice(0, 5)} — {task.end_time.slice(0, 5)}
                    {' · '}
                    {staffName}
                    {eqName && (
                      <span className="text-slate-500"> · {eqName}</span>
                    )}
                  </p>
                </div>
                <div className="shrink-0">
                  {isActive ? (
                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => updateStatus(task.id, 'done')}
                      className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-white active:bg-emerald-700 disabled:opacity-50"
                      style={{ touchAction: 'manipulation' }}
                    >
                      <CheckCircle className="h-5 w-5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => updateStatus(task.id, 'in_progress')}
                      className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-600 text-white active:bg-sky-700 disabled:opacity-50"
                      style={{ touchAction: 'manipulation' }}
                    >
                      <Play className="h-5 w-5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
