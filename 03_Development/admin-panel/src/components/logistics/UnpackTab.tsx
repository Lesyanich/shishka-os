import { useCallback, useEffect, useState } from 'react'
import { Package, AlertCircle, Clock, ScanLine } from 'lucide-react'
import type { Batch } from '../../hooks/useBatches'

interface UnpackTabProps {
  batches: Batch[]
  onOpenBatch: (batchId: string) => Promise<{ ok: boolean; expires_at?: string; error?: string }>
}

interface ActiveTimer {
  batchId: string
  barcode: string
  name: string | undefined
  weight: number
  expiresAt: string
}

function formatCountdown(expiresAt: string): { text: string; isExpired: boolean; isUrgent: boolean } {
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) return { text: 'EXPIRED', isExpired: true, isUrgent: true }

  const hours = Math.floor(diff / 3600000)
  const mins = Math.floor((diff % 3600000) / 60000)
  const secs = Math.floor((diff % 60000) / 1000)

  const text = hours > 0
    ? `${hours}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`
    : `${mins}m ${String(secs).padStart(2, '0')}s`

  return { text, isExpired: false, isUrgent: diff < 3600000 }
}

export function UnpackTab({ batches, onOpenBatch }: UnpackTabProps) {
  const [barcode, setBarcode] = useState('')
  const [isOpening, setIsOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTimers, setActiveTimers] = useState<ActiveTimer[]>([])
  const [, setTick] = useState(0) // force re-render for countdown

  // Tick every second for countdown timers
  useEffect(() => {
    if (activeTimers.length === 0) return
    const interval = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(interval)
  }, [activeTimers.length])

  // Load opened batches into timers on mount
  useEffect(() => {
    const opened = batches
      .filter((b) => b.status === 'opened' && b.expires_at)
      .map((b) => ({
        batchId: b.id,
        barcode: b.barcode,
        name: b.name,
        weight: b.weight,
        expiresAt: b.expires_at,
      }))
    setActiveTimers(opened)
  }, [batches])

  const handleScan = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = barcode.trim().toUpperCase()
    if (!trimmed) return

    setError(null)
    setIsOpening(true)

    // Find batch by barcode in local state
    const batch = batches.find((b) => b.barcode === trimmed)
    if (!batch) {
      setError(`No active batch with barcode ${trimmed}`)
      setIsOpening(false)
      return
    }

    if (batch.status === 'opened') {
      setError('Batch already opened')
      setIsOpening(false)
      return
    }

    const result = await onOpenBatch(batch.id)
    if (!result.ok) {
      setError(result.error ?? 'Failed to open batch')
    } else {
      // Add to active timers
      setActiveTimers((prev) => [
        {
          batchId: batch.id,
          barcode: batch.barcode,
          name: batch.name,
          weight: batch.weight,
          expiresAt: result.expires_at ?? batch.expires_at,
        },
        ...prev,
      ])
    }

    setBarcode('')
    setIsOpening(false)
  }, [barcode, batches, onOpenBatch])

  return (
    <div className="space-y-6">
      {/* Scanner input */}
      <form onSubmit={handleScan} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs text-slate-500">
            Scan barcode to unpack (open)
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <ScanLine className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="e.g. A1B2C3D4"
                autoFocus
                className="w-full rounded-xl border border-slate-700 bg-slate-800 py-4 pl-11 pr-4 font-mono text-lg uppercase tracking-widest text-slate-100 placeholder-slate-600 outline-none focus:border-sky-500"
              />
            </div>
            <button
              type="submit"
              disabled={isOpening || !barcode.trim()}
              className="flex items-center gap-2 rounded-xl bg-amber-600 px-6 py-4 text-sm font-semibold text-white transition hover:bg-amber-500 active:scale-[0.98] disabled:opacity-50"
            >
              <Package className="h-5 w-5" />
              Open
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
            <p className="text-xs text-rose-400">{error}</p>
          </div>
        )}
      </form>

      {/* Active countdown timers */}
      {activeTimers.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400">
            <Clock className="mr-1 inline h-3 w-3" />
            Open Containers — Use Before Expiry
          </h3>
          {activeTimers.map((timer) => {
            const cd = formatCountdown(timer.expiresAt)
            return (
              <div
                key={timer.batchId}
                className={[
                  'flex items-center justify-between rounded-xl border p-4',
                  cd.isExpired
                    ? 'border-rose-500/30 bg-rose-500/5'
                    : cd.isUrgent
                      ? 'border-amber-500/30 bg-amber-500/5'
                      : 'border-slate-700 bg-slate-800/60',
                ].join(' ')}
              >
                <div>
                  <p className="font-mono text-sm font-bold tracking-widest text-slate-200">
                    {timer.barcode}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {timer.name ?? 'Unknown'} · {timer.weight.toFixed(2)} kg
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={[
                      'font-mono text-lg font-bold',
                      cd.isExpired
                        ? 'text-rose-400'
                        : cd.isUrgent
                          ? 'text-amber-400'
                          : 'text-emerald-400',
                    ].join(' ')}
                  >
                    {cd.text}
                  </p>
                  <p className="text-[10px] text-slate-600">
                    expires {new Date(timer.expiresAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Empty state */}
      {activeTimers.length === 0 && (
        <div className="py-8 text-center">
          <Package className="mx-auto mb-2 h-8 w-8 text-slate-700" />
          <p className="text-xs text-slate-500">No opened containers</p>
          <p className="text-[10px] text-slate-600">
            Scan a barcode to open a sealed batch and start the shelf-life timer
          </p>
        </div>
      )}
    </div>
  )
}
