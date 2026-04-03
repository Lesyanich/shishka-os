import { useCallback, useEffect, useState } from 'react'
import { Play, CheckCircle2, FileText, Clock, Plus, Minus, Package, AlertTriangle } from 'lucide-react'
import type { CookTask } from '../../hooks/useCookTasks'
import type { BatchCreationResult } from '../../hooks/useBatches'
import { DeviationBadge } from './DeviationBadge'
import { BOMSnapshotPanel } from './BOMSnapshotPanel'

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
  const [containers, setContainers] = useState<string[]>([''])
  const [showBOM, setShowBOM] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [batchResult, setBatchResult] = useState<BatchCreationResult | null>(null)

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

  // Add/remove containers
  const addContainer = () => setContainers((prev) => [...prev, ''])
  const removeContainer = (idx: number) => {
    setContainers((prev) => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)
  }
  const updateContainer = (idx: number, value: string) => {
    setContainers((prev) => prev.map((v, i) => (i === idx ? value : v)))
  }

  // Total weight from all containers
  const totalWeight = containers.reduce((sum, c) => {
    const w = parseFloat(c)
    return sum + (isNaN(w) ? 0 : w)
  }, 0)

  const handleCompleteBatches = useCallback(async () => {
    // Validate all containers have valid weight
    const parsed = containers.map((c) => parseFloat(c))
    if (parsed.some((w) => isNaN(w) || w <= 0)) {
      setActionError('All containers must have weight > 0')
      return
    }

    setIsActioning(true)
    setActionError(null)
    const result = await onCompleteBatches(
      task.id,
      parsed.map((w) => ({ weight: w })),
    )
    if (!result.ok) {
      setActionError(result.error ?? 'Failed to create batches')
    } else {
      setBatchResult(result)
    }
    setIsActioning(false)
  }, [onCompleteBatches, task.id, containers])

  const closeModal = () => {
    setShowCompleteModal(false)
    setBatchResult(null)
    setContainers([''])
    setActionError(null)
  }

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

      {/* Complete modal — batch container entry */}
      {showCompleteModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-slate-900 p-6 sm:rounded-2xl">
            {!batchResult ? (
              <>
                <div className="mb-4 flex items-center gap-2">
                  <Package className="h-5 w-5 text-sky-400" />
                  <h3 className="text-sm font-semibold text-slate-100">
                    Batch Packaging
                  </h3>
                </div>
                <p className="mb-4 text-xs text-slate-500">
                  Enter the weight of each container/package produced.
                  A barcode will be generated for each.
                </p>

                {/* Container weight inputs */}
                <div className="mb-4 space-y-2">
                  {containers.map((weight, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="w-6 text-center text-xs text-slate-500">
                        {idx + 1}
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={weight}
                        onChange={(e) => updateContainer(idx, e.target.value)}
                        placeholder="Weight (kg)"
                        autoFocus={idx === 0}
                        className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-lg text-slate-100 placeholder-slate-500 outline-none focus:border-sky-500"
                      />
                      <button
                        onClick={() => removeContainer(idx)}
                        disabled={containers.length === 1}
                        className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-800 hover:text-rose-400 disabled:opacity-30"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add container button */}
                <button
                  onClick={addContainer}
                  className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700 py-2 text-xs text-slate-400 transition hover:border-sky-500 hover:text-sky-400"
                >
                  <Plus className="h-3 w-3" />
                  Add Container
                </button>

                {/* Summary row */}
                <div className="mb-4 flex items-center justify-between rounded-xl bg-slate-800/60 px-4 py-3">
                  <span className="text-xs text-slate-400">
                    {containers.length} container{containers.length > 1 ? 's' : ''} · Total
                  </span>
                  <span className="font-mono text-lg font-bold text-slate-100">
                    {totalWeight.toFixed(2)} kg
                  </span>
                </div>

                {/* Deviation badge */}
                {task.theoretical_yield != null && totalWeight > 0 && (
                  <div className="mb-4">
                    <DeviationBadge
                      label="Yield"
                      actual={totalWeight}
                      expected={task.theoretical_yield}
                      unit="kg"
                    />
                  </div>
                )}

                {actionError && (
                  <p className="mb-2 text-xs text-rose-400">{actionError}</p>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={closeModal}
                    className="flex-1 rounded-xl border border-slate-700 py-3 text-sm text-slate-300 transition hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCompleteBatches}
                    disabled={isActioning}
                    className="flex-1 rounded-xl bg-sky-600 py-3 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:opacity-50"
                  >
                    {isActioning ? 'Creating...' : `Create ${containers.length} Batch${containers.length > 1 ? 'es' : ''}`}
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Success: Show generated barcodes */}
                <div className="mb-4 text-center">
                  <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
                    <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-100">
                    {batchResult.batch_count} Batch{(batchResult.batch_count ?? 0) > 1 ? 'es' : ''} Created
                  </h3>
                  <p className="text-xs text-slate-500">
                    Total: {batchResult.total_weight?.toFixed(2)} kg
                  </p>
                </div>

                {/* Barcode list */}
                <div className="mb-4 space-y-2">
                  {(batchResult.batches ?? []).map((b, idx) => (
                    <div
                      key={b.batch_id}
                      className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3"
                    >
                      <div>
                        <p className="text-[10px] text-slate-500">
                          Container {idx + 1}
                        </p>
                        <p className="font-mono text-lg font-bold tracking-widest text-emerald-300">
                          {b.barcode}
                        </p>
                      </div>
                      <span className="text-sm text-slate-300">
                        {b.weight.toFixed(2)} kg
                      </span>
                    </div>
                  ))}
                </div>

                <p className="mb-4 text-center text-[10px] text-slate-600">
                  Print these barcodes on labels (ZPL printer integration coming soon)
                </p>

                <button
                  onClick={closeModal}
                  className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500"
                >
                  Done
                </button>
              </>
            )}
          </div>
        </div>
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
