import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, LogOut, SprayCanIcon } from 'lucide-react'
import { useCook } from '../contexts/CookContext'
import { useCookTasks } from '../hooks/useCookTasks'
import { TaskCard } from '../components/TaskCard'
import { ProgressBar } from '../components/ProgressBar'
import { CleanScreenOverlay } from '../components/CleanScreenOverlay'

export function DashboardPage() {
  const navigate = useNavigate()
  const { cook, logout } = useCook()
  const { tasks, isLoading, error, refetch, startTask } = useCookTasks(cook?.id ?? null)
  const [cleanMode, setCleanMode] = useState(false)

  const handleLogout = useCallback(() => {
    logout()
    navigate('/login')
  }, [logout, navigate])

  const activeTasks = tasks.filter(t => t.status === 'in_progress')
  const pendingTasks = tasks.filter(t => t.status === 'pending')
  const completedCount = tasks.filter(t => t.status === 'completed').length

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  })

  return (
    <div className="mx-auto max-w-lg px-4 py-6 space-y-6">
      {cleanMode && <CleanScreenOverlay onDone={() => setCleanMode(false)} />}

      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">{cook?.name}</h1>
          <p className="text-xs text-slate-500">{today}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCleanMode(true)}
            className="rounded-xl border border-slate-700 p-3 text-slate-400 transition hover:bg-slate-800"
            title="Clean Screen"
          >
            <SprayCanIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={refetch}
            className="rounded-xl border border-slate-700 p-3 text-slate-400 transition hover:bg-slate-800"
            title="Refresh"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-xl border border-slate-700 p-3 text-slate-400 transition hover:bg-slate-800"
            title="Logout"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Progress */}
      <ProgressBar
        total={tasks.length}
        completed={completedCount}
        inProgress={activeTasks.length}
      />

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

      {/* Active tasks */}
      {!isLoading && activeTasks.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-sky-400">
            In Progress
          </h2>
          {activeTasks.map(task => (
            <TaskCard key={task.id} task={task} onStart={startTask} />
          ))}
        </div>
      )}

      {/* Pending tasks */}
      {!isLoading && pendingTasks.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-amber-400">
            Up Next
          </h2>
          {pendingTasks.map(task => (
            <TaskCard key={task.id} task={task} onStart={startTask} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && tasks.length === 0 && (
        <div className="py-16 text-center">
          <p className="text-lg text-slate-400">No tasks assigned</p>
          <p className="mt-1 text-sm text-slate-600">
            Tasks will appear when scheduled by the su-chef
          </p>
        </div>
      )}
    </div>
  )
}
