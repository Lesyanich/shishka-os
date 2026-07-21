import { useState } from 'react'
import { AlertTriangle, CalendarClock, Check, Loader2, X } from 'lucide-react'
import { useAppRole } from '../../contexts/AppRoleContext'
import {
  useExpiringBatches,
  useExpiryBuckets,
  type ExpiringBatch,
} from '../../hooks/useExpiringBatches'

/* ─── Urgency styling ─── */

function urgencyLabel(days: number | null): string {
  if (days == null) return 'No expiry set'
  if (days < 0) return `Expired ${Math.abs(days)}d ago`
  if (days === 0) return 'Expires today'
  if (days === 1) return 'Expires tomorrow'
  return `${days}d left`
}

function urgencyClass(days: number | null): string {
  if (days == null) return 'text-slate-500'
  if (days < 0) return 'text-rose-400'
  if (days === 0) return 'text-amber-400'
  if (days <= 2) return 'text-yellow-400'
  return 'text-slate-400'
}

function dotClass(days: number | null): string {
  if (days == null) return 'bg-slate-600'
  if (days < 0) return 'bg-rose-500'
  if (days === 0) return 'bg-amber-500'
  if (days <= 2) return 'bg-yellow-500'
  return 'bg-emerald-500'
}

/* ─── Single batch row ─── */

function BatchRow({
  batch,
  onWaste,
}: {
  batch: ExpiringBatch
  onWaste: (b: ExpiringBatch) => Promise<{ ok: boolean; error?: string }>
}) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const estCost =
    batch.cost_per_unit != null ? batch.cost_per_unit * batch.weight : null

  const handleWaste = async () => {
    setBusy(true)
    setErr(null)
    const res = await onWaste(batch)
    if (!res.ok) {
      setErr(res.error ?? 'Failed to write off')
      setBusy(false)
      setConfirming(false)
    }
    // On success the row disappears via refetch; no need to reset state.
  }

  return (
    <div className="flex items-center gap-3 border-b border-slate-800/50 px-4 py-2.5 last:border-0">
      <span className={['h-2 w-2 shrink-0 rounded-full', dotClass(batch.daysToExpiry)].join(' ')} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-slate-200">
          {batch.name ?? batch.product_code ?? batch.barcode}
        </p>
        <p className="truncate text-[10px] text-slate-500">
          {batch.weight}
          {batch.base_unit ? ` ${batch.base_unit}` : ''}
          {batch.location_name ? ` · ${batch.location_name}` : ''}
          {' · '}
          {batch.barcode}
          {estCost != null ? ` · ฿${estCost.toFixed(0)}` : ''}
        </p>
        {err && (
          <p className="mt-0.5 flex items-center gap-1 text-[10px] text-rose-400">
            <AlertTriangle className="h-2.5 w-2.5" />
            {err}
          </p>
        )}
      </div>

      <span className={['shrink-0 text-[10px] font-medium', urgencyClass(batch.daysToExpiry)].join(' ')}>
        {urgencyLabel(batch.daysToExpiry)}
      </span>

      {/* Write-off action with inline confirm */}
      {busy ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-rose-400" />
      ) : confirming ? (
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={handleWaste}
            title="Confirm write-off"
            className="rounded-md bg-rose-600 px-2 py-1 text-[10px] font-semibold text-white transition hover:bg-rose-500"
          >
            <Check className="h-3 w-3" />
          </button>
          <button
            onClick={() => setConfirming(false)}
            title="Cancel"
            className="rounded-md border border-slate-700 px-2 py-1 text-[10px] text-slate-400 transition hover:border-slate-600"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="shrink-0 rounded-md border border-slate-700 px-2.5 py-1 text-[10px] font-medium text-slate-300 transition hover:border-rose-500/50 hover:text-rose-300"
        >
          Write off
        </button>
      )}
    </div>
  )
}

/* ─── Panel ─── */

export function ExpiringSoon() {
  const { staffId } = useAppRole()
  const { batches, isLoading, error, wasteBatch } = useExpiringBatches()
  const { expired, today, soon } = useExpiryBuckets(batches)

  // Surface only what needs attention: expired, today, ≤2 days.
  const actionable = [...expired, ...today, ...soon]

  const onWaste = (b: ExpiringBatch) => wasteBatch(b, 'expiration', staffId ?? null)

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-slate-100">Expiring Soon</h3>
        </div>
        {actionable.length > 0 && (
          <span className="flex items-center gap-2 text-[10px] text-slate-500">
            {expired.length > 0 && (
              <span className="rounded-full bg-rose-500/10 px-2 py-0.5 font-medium text-rose-400">
                {expired.length} expired
              </span>
            )}
            {today.length > 0 && (
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 font-medium text-amber-400">
                {today.length} today
              </span>
            )}
            {soon.length > 0 && (
              <span className="rounded-full bg-yellow-500/10 px-2 py-0.5 font-medium text-yellow-400">
                {soon.length} soon
              </span>
            )}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-slate-800/50" />
          ))}
        </div>
      ) : error ? (
        <div className="p-4 text-center text-xs text-rose-300">{error}</div>
      ) : actionable.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-500">
          Nothing expiring in the next 2 days. 🎉
        </div>
      ) : (
        <div className="max-h-[340px] overflow-y-auto">
          {actionable.map((b) => (
            <BatchRow key={b.id} batch={b} onWaste={onWaste} />
          ))}
        </div>
      )}
    </div>
  )
}
