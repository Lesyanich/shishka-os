import { useCookTasks } from '../hooks/useCookTasks'
import { TaskExecutionCard } from '../components/kds/TaskExecutionCard'
import { ChefHat } from 'lucide-react'

export function CookStation() {
  const { tasks, isLoading, error, startTask, completeTask } = useCookTasks()

  const pendingTasks = tasks.filter((t) => t.status === 'pending')
  const activeTasks = tasks.filter((t) => t.status === 'in_progress')

  return (
    <div className="mx-auto max-w-lg space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
          <ChefHat className="h-6 w-6 text-emerald-400" />
        </div>
        <h1 className="text-lg font-bold text-slate-100">Cook Station</h1>
        <p className="text-xs text-slate-500">
          {activeTasks.length} active · {pendingTasks.length} pending
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-center text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-800/50" />
          ))}
        </div>
      )}

      {/* Active tasks (in_progress first) */}
      {!isLoading && activeTasks.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-sky-400">
            In Progress
          </h2>
          {activeTasks.map((task) => (
            <TaskExecutionCard
              key={task.id}
              task={task}
              onStart={startTask}
              onComplete={completeTask}
            />
          ))}
        </div>
      )}

      {/* Pending tasks */}
      {!isLoading && pendingTasks.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-amber-400">
            Pending
          </h2>
          {pendingTasks.map((task) => (
            <TaskExecutionCard
              key={task.id}
              task={task}
              onStart={startTask}
              onComplete={completeTask}
            />
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && tasks.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-sm text-slate-500">No tasks assigned</p>
          <p className="text-xs text-slate-600">
            Tasks will appear here when scheduled by the CEO
          </p>
        </div>
      )}
    </div>
  )
}
