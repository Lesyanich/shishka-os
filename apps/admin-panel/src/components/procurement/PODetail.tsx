import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, Send, XCircle, DollarSign } from 'lucide-react'
import type { PurchaseOrder, POLine, POStatus } from '../../types/procurement'

const NEXT_ACTIONS: Partial<Record<POStatus, { label: string; next: POStatus; color: string }>> = {
  draft: {
    label: 'Mark as Submitted',
    next: 'submitted',
    color: 'bg-honey-600 hover:bg-honey-300',
  },
  submitted: {
    label: 'Mark as Confirmed',
    next: 'confirmed',
    color: 'bg-honey-600 hover:bg-honey-300',
  },
  confirmed: {
    label: 'Mark as Shipped',
    next: 'shipped',
    color: 'bg-nutri-car hover:brightness-110',
  },
}

interface Props {
  order: PurchaseOrder
  onBack: () => void
  fetchLines: (poId: string) => Promise<POLine[]>
  updateStatus: (poId: string, status: POStatus) => Promise<boolean>
  onReconcile?: (order: PurchaseOrder) => void
}

export function PODetail({ order, onBack, fetchLines, updateStatus, onReconcile }: Props) {
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
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--s-2)] text-cream/60 transition hover:text-cream"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-cream">{order.po_number}</h2>
          <p className="text-xs text-cream/45">
            {order.supplier_name}
            {order.expected_date && (
              <>
                {' '}
                &middot; Expected{' '}
                {new Date(order.expected_date).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </>
            )}
          </p>
        </div>
      </div>

      {/* Status + totals */}
      <div className="flex items-center gap-3 rounded-xl border border-[var(--line-strong)] bg-[var(--s-2)] p-3">
        <div className="flex-1">
          <p className="text-[11px] text-cream/45">Status</p>
          <p className="text-sm font-semibold capitalize text-cream">
            {order.status.replace('_', ' ')}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-cream/45">Estimated Total</p>
          <p className="text-sm font-semibold text-cream">
            {totalEstimated > 0 ? `${totalEstimated.toLocaleString()} THB` : '—'}
          </p>
        </div>
      </div>

      {order.notes && (
        <p className="rounded-lg border border-[var(--line-strong)] bg-[var(--s-2)] p-2.5 text-xs text-cream/60">
          {order.notes}
        </p>
      )}

      {/* Line items */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-medium text-cream/45">{lines.length} Items</p>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-[var(--s-2)]" />
            ))}
          </div>
        ) : (
          lines.map((l) => (
            <div
              key={l.id}
              className="flex items-center gap-3 rounded-lg border border-[var(--line-strong)] bg-[var(--s-2)] p-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-cream">{l.product_name}</p>
                <p className="text-[10px] text-cream/45">
                  {l.product_code} &middot; {l.qty_ordered} {l.unit || l.base_unit}
                </p>
              </div>
              <div className="shrink-0 text-right">
                {l.unit_price_expected != null ? (
                  <>
                    <p className="text-xs font-medium text-cream">
                      {(l.total_expected ?? 0).toLocaleString()} THB
                    </p>
                    <p className="text-[10px] text-cream/45">
                      @{l.unit_price_expected.toLocaleString()}/{l.unit || l.base_unit}
                    </p>
                  </>
                ) : (
                  <p className="text-[10px] text-cream/45">Price TBD</p>
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

        {['received', 'partially_received'].includes(order.status) && onReconcile && (
          <button
            onClick={() => onReconcile(order)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-royal-green)] py-3 text-sm font-semibold text-white transition hover:bg-[var(--color-royal-soft)] active:scale-[0.99]"
          >
            <DollarSign className="h-4 w-4" />
            Reconcile &amp; Approve
          </button>
        )}

        {!['reconciled', 'cancelled'].includes(order.status) && (
          <button
            onClick={handleCancel}
            disabled={isUpdating}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--s-3)] py-2.5 text-xs text-cream/60 transition hover:bg-brick-soft/10 hover:text-brick-bright active:scale-[0.99] disabled:opacity-50"
          >
            <XCircle className="h-3.5 w-3.5" />
            Cancel PO
          </button>
        )}
      </div>
    </div>
  )
}
