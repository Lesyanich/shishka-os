import { Clock } from 'lucide-react'
import type { DashboardShiftTask } from '../../hooks/useKitchenDashboard'

interface UpcomingTasksProps {
  tasks: DashboardShiftTask[]
}

export function UpcomingTasks({ tasks }: UpcomingTasksProps) {
  const pendingTasks = tasks
    .filter((t) => t.status === 'pending')
    .slice(0, 10)

  // Highlight tasks starting within 30 minutes
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()

  function isUpcoming(timeStr: string): boolean {
    const [h, m] = timeStr.split(':').map(Number)
    const taskMin = h * 60 + m
    return taskMin >= nowMin && taskMin <= nowMin + 30
  }

  if (pendingTasks.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-100">
          <Clock className="h-5 w-5 text-violet-400" />
          Upcoming Tasks
        </h2>
        <p className="text-base text-slate-500">No upcoming tasks</p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-100">
        <Clock className="h-5 w-5 text-violet-400" />
        Upcoming Tasks
        <span className="ml-auto text-sm text-slate-500">{pendingTasks.length}</span>
      </h2>
      <div className="space-y-2">
        {pendingTasks.map((task) => {
          const upcoming = isUpcoming(task.start_time)
          const staffName = task.shift?.staff?.name ?? '—'
          const eqName = task.equipment?.name

          return (
            <div
              key={task.id}
              className={`rounded-xl px-3 py-3 ${
                upcoming
                  ? 'border border-amber-500/30 bg-amber-500/5'
                  : 'bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={`shrink-0 text-sm font-medium ${upcoming ? 'text-amber-300' : 'text-slate-400'}`}>
                  {task.start_time.slice(0, 5)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base text-slate-100">
                    {task.task_description ?? 'No description'}
                  </p>
                  <p className="text-sm text-slate-500">
                    {staffName}
                    {eqName && <span> · {eqName}</span>}
                  </p>
                </div>
                {upcoming && (
                  <span className="shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-300">
                    Soon
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
