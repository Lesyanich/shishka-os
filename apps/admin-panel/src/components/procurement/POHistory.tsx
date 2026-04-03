import { FileText, ChevronRight } from 'lucide-react'
import type { PurchaseOrder, POStatus } from '../../types/procurement'

const STATUS_COLORS: Record<POStatus, string> = {
  draft: 'bg-slate-500/20 text-slate-300',
  submitted: 'bg-sky-500/20 text-sky-300',
  confirmed: 'bg-blue-500/20 text-blue-300',
  shipped: 'bg-violet-500/20 text-violet-300',
  partially_received: 'bg-amber-500/20 text-amber-300',
  received: 'bg-emerald-500/20 text-emerald-300',
  reconciled: 'bg-emerald-600/20 text-emerald-200',
  cancelled: 'bg-red-500/20 text-red-300',
}

const STATUS_LABELS: Record<POStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  confirmed: 'Confirmed',
  shipped: 'Shipped',
  partially_received: 'Partial',
  received: 'Received',
  reconciled: 'Reconciled',
  cancelled: 'Cancelled',
}

const FILTER_STATUSES: (POStatus | 'all')[] = [
  'all', 'draft', 'submitted', 'confirmed', 'shipped',
  'partially_received', 'received', 'reconciled',
]

interface Props {
  orders: PurchaseOrder[]
  isLoading: boolean
  statusFilter: POStatus | 'all'
  onFilterChange: (s: POStatus | 'all') => void
  onSelect: (order: PurchaseOrder) => void
}

export function POHistory({ orders, isLoading, statusFilter, onFilterChange, onSelect }: Props) {
  return (
    <div className="space-y-3 rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
      <h3 className="text-sm font-bold text-slate-100">Purchase Orders</h3>

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {FILTER_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => onFilterChange(s)}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition active:scale-95 ${
              statusFilter === s
                ? 'bg-sky-500/30 text-sky-200'
                : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {s === 'all' ? 'All' : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-slate-800/50" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && orders.length === 0 && (
        <div className="py-6 text-center">
          <FileText className="mx-auto mb-2 h-8 w-8 text-slate-600" />
          <p className="text-xs text-slate-500">No purchase orders found</p>
        </div>
      )}

      {/* PO list */}
      {!isLoading && orders.length > 0 && (
        <div className="space-y-1.5">
          {orders.map((po) => (
            <button
              key={po.id}
              onClick={() => onSelect(po)}
              className="group flex w-full items-center gap-3 rounded-lg border border-slate-700/30 bg-slate-800/20 p-3 text-left transition hover:border-sky-500/30 hover:bg-slate-800/40 active:scale-[0.99]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-100">{po.po_number}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLORS[po.status]}`}>
                    {STATUS_LABELS[po.status]}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-slate-400">{po.supplier_name}</p>
                <div className="mt-0.5 flex items-center gap-3 text-[10px] text-slate-500">
                  <span>{po.line_count} items</span>
                  {po.expected_date && (
                    <span>
                      {new Date(po.expected_date).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                  )}
                  {po.grand_total != null && (
                    <span>{po.grand_total.toLocaleString()} THB</span>
                  )}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-600 transition group-hover:text-sky-400" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
