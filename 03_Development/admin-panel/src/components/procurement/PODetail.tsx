import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, Send, CheckCircle, XCircle } from 'lucide-react'
import type { PurchaseOrder, POLine, POStatus } from '../../types/procurement'

const NEXT_ACTIONS: Partial<Record<POStatus, { label: string; next: POStatus; color: string }>> = {
  draft: { label: 'Mark as Submitted', next: 'submitted', color: 'bg-sky-600 hover:bg-sky-500' },
  submitted: { label: 'Mark as Confirmed', next: 'confirmed', color: 'bg-blue-600 hover:bg-blue-500' },
  confirmed: { label: 'Mark as Shipped', next: 'shipped', color: 'bg-violet-600 hover:bg-violet-500' },
}

interface Props {
  order: PurchaseOrder
  onBack: () => void
  fetchLines: (poId: string) => Promise<POLine[]>
  updateStatus: (poId: string, status: POStatus) => Promise<boolean>
}

export function PODetail({ order, onBack, fetchLines, updateStatus }: Props) {
  const [lines, setLines] = useState<POLine[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const data = await fetchLines(order.id)
      setLines(data)
      setIsLoading(false)
    }
    load()
  }, [order.id, fetchLines])

  const action = NEXT_ACTIONS[order.status]

  const handleStatusChange = useCallback(async () => {
    if (!action) return
    setIsUpdating(true)
    await updateStatus(order.id, action.next)
    setIsUpdating(false)
    onBack()
  }, [action, order.id, updateStatus, onBack])

  const handleCancel = useCallback(async () => {
    if (!confirm('Cancel this PO? This cannot be undone.')) return
    setIsUpdating(true)
    await updateStatus(order.id, 'cancelled')
    setIsUpdating(false)
    onBack()
  }, [order.id, updateStatus, onBack])

  const totalEstimated = lines.reduce((sum, l) => sum + (l.total_expected ?? 0), 0)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800 text-slate-400 transition hover:text-slate-100"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-slate-100">{order.po_number}</h2>
          <p className="text-xs text-slate-500">
            {order.supplier_name}
            {order.expected_date && (
              <> &middot; Expected {new Date(order.expected_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</>
            )}
          </p>
        </div>
      </div>

      {/* Status + totals */}
      <div className="flex items-center gap-3 rounded-xl border border-slate-700/50 bg-slate-800/30 p-3">
        <div className="flex-1">
          <p className="text-[11px] text-slate-500">Status</p>
          <p className="text-sm font-semibold capitalize text-slate-100">{order.status.replace('_', ' ')}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-slate-500">Estimated Total</p>
          <p className="text-sm font-semibold text-slate-100">
            {totalEstimated > 0 ? `${totalEstimated.toLocaleString()} THB` : '—'}
          </p>
        </div>
      </div>

      {order.notes && (
        <p className="rounded-lg border border-slate-700/30 bg-slate-800/20 p-2.5 text-xs text-slate-400">
          {order.notes}
        </p>
      )}

      {/* Line items */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-medium text-slate-500">{lines.length} Items</p>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-800/50" />
            ))}
          </div>
        ) : (
          lines.map((l) => (
            <div
              key={l.id}
              className="flex items-center gap-3 rounded-lg border border-slate-700/30 bg-slate-800/20 p-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-100">
                  {l.product_name}
                </p>
                <p className="text-[10px] text-slate-500">
                  {l.product_code} &middot; {l.qty_ordered} {l.unit || l.base_unit}
                </p>
              </div>
              <div className="shrink-0 text-right">
                {l.unit_price_expected != null ? (
                  <>
                    <p className="text-xs font-medium text-slate-200">
                      {(l.total_expected ?? 0).toLocaleString()} THB
                    </p>
                    <p className="text-[10px] text-slate-500">
                      @{l.unit_price_expected.toLocaleString()}/{l.unit || l.base_unit}
                    </p>
                  </>
                ) : (
                  <p className="text-[10px] text-slate-500">Price TBD</p>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Actions */}
      <div className="space-y-2 pt-2">
        {action && (
          <button
            onClick={handleStatusChange}
            disabled={isUpdating}
            className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white transition active:scale-[0.99] disabled:opacity-50 ${action.color}`}
          >
            <Send className="h-4 w-4" />
            {isUpdating ? 'Updating...' : action.label}
          </button>
        )}

        {order.status === 'received' && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-300">
            <CheckCircle className="h-4 w-4 shrink-0" />
            Ready for reconciliation in Finance
          </div>
        )}

        {!['reconciled', 'cancelled'].includes(order.status) && (
          <button
            onClick={handleCancel}
            disabled={isUpdating}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-700/30 py-2.5 text-xs text-slate-400 transition hover:bg-red-500/10 hover:text-red-400 active:scale-[0.99] disabled:opacity-50"
          >
            <XCircle className="h-3.5 w-3.5" />
            Cancel PO
          </button>
        )}
      </div>
    </div>
  )
}
