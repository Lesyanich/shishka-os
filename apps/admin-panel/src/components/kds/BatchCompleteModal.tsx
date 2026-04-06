import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Plus, Minus, Package } from 'lucide-react'
import type { BatchCreationResult } from '../../hooks/useBatches'
import { DeviationBadge } from './DeviationBadge'

interface BatchCompleteModalProps {
  taskId: string
  theoreticalYield: number | null | undefined
  onCompleteBatches: (
    taskId: string,
    containers: { weight: number }[],
  ) => Promise<BatchCreationResult>
  onClose: () => void
}

export function BatchCompleteModal({
  taskId,
  theoreticalYield,
  onCompleteBatches,
  onClose,
}: BatchCompleteModalProps) {
  const [containers, setContainers] = useState<string[]>(() => {
    try {
      const saved = sessionStorage.getItem(`batch-weights-${taskId}`)
      return saved ? JSON.parse(saved) : ['']
    } catch { return [''] }
  })
  const [isActioning, setIsActioning] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [batchResult, setBatchResult] = useState<BatchCreationResult | null>(null)

  // Persist container weights to sessionStorage
  useEffect(() => {
    const hasData = containers.some((c) => c !== '')
    if (hasData) {
      sessionStorage.setItem(`batch-weights-${taskId}`, JSON.stringify(containers))
    }
  }, [containers, taskId])

  const addContainer = () => setContainers((prev) => [...prev, ''])
  const removeContainer = (idx: number) => {
    setContainers((prev) => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)
  }
  const updateContainer = (idx: number, value: string) => {
    setContainers((prev) => prev.map((v, i) => (i === idx ? value : v)))
  }

  const totalWeight = containers.reduce((sum, c) => {
    const w = parseFloat(c)
    return sum + (isNaN(w) ? 0 : w)
  }, 0)

  const handleCompleteBatches = useCallback(async () => {
    const parsed = containers.map((c) => parseFloat(c))
    if (parsed.some((w) => isNaN(w) || w <= 0)) {
      setActionError('All containers must have weight > 0')
      return
    }

    setIsActioning(true)
    setActionError(null)
    const result = await onCompleteBatches(
      taskId,
      parsed.map((w) => ({ weight: w })),
    )
    if (!result.ok) {
      setActionError(result.error ?? 'Failed to create batches')
    } else {
      setBatchResult(result)
    }
    setIsActioning(false)
  }, [onCompleteBatches, taskId, containers])

  const handleClose = () => {
    if (batchResult) {
      sessionStorage.removeItem(`batch-weights-${taskId}`)
    }
    onClose()
  }

  return (
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
            {theoreticalYield != null && totalWeight > 0 && (
              <div className="mb-4">
                <DeviationBadge
                  label="Yield"
                  actual={totalWeight}
                  expected={theoreticalYield}
                  unit="kg"
                />
              </div>
            )}

            {actionError && (
              <p className="mb-2 text-xs text-rose-400">{actionError}</p>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleClose}
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
              onClick={handleClose}
              className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500"
            >
              Done
            </button>
          </>
        )}
      </div>
    </div>
  )
}
