import { useCallback, useEffect, useState } from 'react'
import { Play, CheckCircle2, FileText, Clock, AlertTriangle } from 'lucide-react'
import type { CookTask } from '../../hooks/useCookTasks'
import type { BatchCreationResult } from '../../hooks/useBatches'
import { DeviationBadge } from './DeviationBadge'
import { BOMSnapshotPanel } from './BOMSnapshotPanel'
import { BatchCompleteModal } from './BatchCompleteModal'

interface TaskExecutionCardProps {
  task: CookTask
  onStart: (taskId: string) => Promise<{ ok: boolean; error?: string }>
  onCompleteBatches: (
    taskId: string,
    containers: { weight: number }[],
  ) => Promise<BatchCreationResult>
}

function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function TaskExecutionCard({ task, onStart, onCompleteBatches }: TaskExecutionCardProps) {
  const [elapsedSec, setElapsedSec] = useState(0)
  const [isActioning, setIsActioning] = useState(false)
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [showBOM, setShowBOM] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // Timer for in_progress tasks
  useEffect(() => {
    if (task.status !== 'in_progress' || !task.actual_start) {
      setElapsedSec(0)
      return
    }

    const startMs = new Date(task.actual_start).getTime()
    const tick = () => {
      setElapsedSec(Math.floor((Date.now() - startMs) / 1000))
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [task.status, task.actual_start])

  const expectedSec = (task.duration_min ?? 0) * 60
  const isOvertime = elapsedSec > expectedSec && expectedSec > 0

  const handleStart = useCallback(async () => {
    setIsActioning(true)
    setActionError(null)
    const result = await onStart(task.id)
    if (!result.ok) setActionError(result.error ?? 'Failed to start')
    setIsActioning(false)
  }, [onStart, task.id])

  return (
    <>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
        {/* Header */}
        <div className="mb-3 flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-100">
              {task.target_nomenclature?.name ?? task.description ?? 'Production Task'}
            </p>
            <p className="text-[10px] text-slate-500">
              {task.target_nomenclature?.product_code ?? task.id.slice(0, 8)}
              {task.target_quantity ? ` · ${task.target_quantity} kg` : ''}
              {task.duration_min ? ` · ${task.duration_min} min` : ''}
            </p>
          </div>
          <span
            className={[
              'ml-2 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
              task.status === 'pending'
                ? 'bg-amber-500/15 text-amber-300'
                : 'bg-sky-500/15 text-sky-300',
            ].join(' ')}
          >
            {task.status}
          </span>
        </div>

        {/* Timer (in_progress only) */}
        {task.status === 'in_progress' && (
          <div className="mb-3 flex items-center gap-3">
            <Clock className="h-5 w-5 text-sky-400" />
            <span
              className={[
                'font-mono text-2xl font-bold',
                isOvertime ? 'text-rose-400' : 'text-sky-300',
              ].join(' ')}
            >
              {formatTimer(elapsedSec)}
            </span>
            {expectedSec > 0 && (
              <span className="text-xs text-slate-500">
                / {formatTimer(expectedSec)}
              </span>
            )}
          </div>
        )}

        {/* Variance badges (in_progress with timer) */}
        {task.status === 'in_progress' && expectedSec > 0 && (
          <div className="mb-3">
            <DeviationBadge
              label="Time"
              actual={elapsedSec / 60}
              expected={task.duration_min ?? 0}
              unit="min"
            />
          </div>
        )}

        {/* Error */}
        {actionError && (
          <p className="mb-2 text-xs text-rose-400">{actionError}</p>
        )}

        {/* Actions — large touch targets for iPad */}
        <div className="flex gap-2">
          {task.status === 'pending' && (
            <button
              onClick={handleStart}
              disabled={isActioning}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50"
            >
              <Play className="h-5 w-5" />
              Start
            </button>
          )}

          {task.status === 'in_progress' && (
            <button
              onClick={() => setShowCompleteModal(true)}
              disabled={isActioning || !task.target_nomenclature_id}
              title={!task.target_nomenclature_id ? 'No target product assigned' : undefined}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-sky-600 py-3 text-sm font-semibold text-white transition hover:bg-sky-500 active:scale-[0.98] disabled:opacity-50"
            >
              <CheckCircle2 className="h-5 w-5" />
              Complete
            </button>
          )}

          {task.status === 'in_progress' && !task.target_nomenclature_id && (
            <div className="flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[10px] text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              No target product assigned
            </div>
          )}

          {task.theoretical_bom_snapshot && (
            <button
              onClick={() => setShowBOM(true)}
              className="flex items-center justify-center rounded-xl border border-slate-700 px-4 py-3 text-sm text-slate-300 transition hover:bg-slate-800 active:scale-[0.98]"
            >
              <FileText className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* Batch complete modal */}
      {showCompleteModal && (
        <BatchCompleteModal
          taskId={task.id}
          theoreticalYield={task.theoretical_yield}
          onCompleteBatches={onCompleteBatches}
          onClose={() => setShowCompleteModal(false)}
        />
      )}

      {/* BOM Snapshot panel */}
      <BOMSnapshotPanel
        snapshot={task.theoretical_bom_snapshot as unknown as { ingredient_id: string; ingredient_code: string; ingredient_name: string; quantity_per_unit: number; yield_loss_pct: number | null }[] | null}
        isOpen={showBOM}
        onClose={() => setShowBOM(false)}
      />
    </>
  )
}
