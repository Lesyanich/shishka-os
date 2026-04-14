import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play, Clock, AlertTriangle } from 'lucide-react'
import type { ProductionTask } from '../types/tasks'

interface TaskCardProps {
  task: ProductionTask
  onStart: (taskId: string) => Promise<{ ok: boolean; error?: string }>
}

function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function TaskCard({ task, onStart }: TaskCardProps) {
  const navigate = useNavigate()
  const [elapsedSec, setElapsedSec] = useState(0)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    if (task.status !== 'in_progress' || !task.actual_start) {
      setElapsedSec(0)
      return
    }
    const startMs = new Date(task.actual_start).getTime()
    const tick = () => setElapsedSec(Math.floor((Date.now() - startMs) / 1000))
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [task.status, task.actual_start])

  const expectedSec = (task.duration_min ?? 0) * 60
  const isOverdue = elapsedSec > expectedSec && expectedSec > 0

  // Color coding
  const borderColor = task.status === 'in_progress'
    ? isOverdue ? 'border-rose-500/50' : 'border-sky-500/40'
    : 'border-amber-500/40'

  const statusBg = task.status === 'in_progress'
    ? isOverdue ? 'bg-rose-500/15 text-rose-300' : 'bg-sky-500/15 text-sky-300'
    : 'bg-amber-500/15 text-amber-300'

  const handleStart = async () => {
    setStarting(true)
    const result = await onStart(task.id)
    setStarting(false)
    if (result.ok) navigate(`/task/${task.id}`)
  }

  const handleTap = () => {
    if (task.status === 'in_progress') navigate(`/task/${task.id}`)
  }

  return (
    <div
      className={`rounded-2xl border ${borderColor} bg-slate-900/80 p-5 transition active:scale-[0.98]`}
      onClick={handleTap}
    >
      {/* Header */}
      <div className="mb-3 flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-slate-100">
            {task.target_nomenclature?.name ?? task.description ?? 'Production Task'}
          </p>
          <p className="text-xs text-slate-500">
            {task.target_nomenclature?.product_code ?? task.id.slice(0, 8)}
            {task.target_quantity ? ` · ${task.target_quantity} kg` : ''}
            {task.duration_min ? ` · ${task.duration_min} min` : ''}
          </p>
        </div>
        <span className={`ml-2 shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusBg}`}>
          {task.status === 'in_progress' ? (isOverdue ? 'OVERDUE' : 'ACTIVE') : 'PENDING'}
        </span>
      </div>

      {/* Timer */}
      {task.status === 'in_progress' && (
        <div className="mb-3 flex items-center gap-3">
          <Clock className="h-5 w-5 text-sky-400" />
          <span className={`font-mono text-2xl font-bold ${isOverdue ? 'text-rose-400' : 'text-sky-300'}`}>
            {formatTimer(elapsedSec)}
          </span>
          {expectedSec > 0 && (
            <span className="text-xs text-slate-500">/ {formatTimer(expectedSec)}</span>
          )}
          {isOverdue && <AlertTriangle className="h-4 w-4 text-rose-400" />}
        </div>
      )}

      {/* Start button for pending tasks */}
      {task.status === 'pending' && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); handleStart() }}
          disabled={starting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-4 text-base font-semibold text-white transition hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50"
        >
          <Play className="h-5 w-5" />
          {starting ? 'Starting...' : 'START'}
        </button>
      )}

      {/* Resume hint for active tasks */}
      {task.status === 'in_progress' && (
        <p className="text-center text-xs text-sky-400/60">Tap to resume recipe steps</p>
      )}
    </div>
  )
}
