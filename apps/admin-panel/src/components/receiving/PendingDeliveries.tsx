import { Package, AlertTriangle, ChevronRight } from 'lucide-react'
import type { PendingDelivery } from '../../types/procurement'

interface Props {
  deliveries: PendingDelivery[]
  onSelect: (delivery: PendingDelivery) => void
}

export function PendingDeliveries({ deliveries, onSelect }: Props) {
  if (deliveries.length === 0) {
    return (
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-8 text-center">
        <Package className="mx-auto mb-3 h-10 w-10 text-slate-600" />
        <p className="text-sm font-medium text-slate-400">No pending deliveries</p>
        <p className="mt-1 text-xs text-slate-600">
          All POs have been received or there are no active orders.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {deliveries.map((d) => (
        <button
          key={d.po_id}
          onClick={() => onSelect(d)}
          className="group flex w-full items-center gap-3 rounded-xl border border-slate-700/50 bg-slate-800/40 p-4 text-left transition hover:border-sky-500/40 hover:bg-slate-800/60 active:scale-[0.99]"
        >
          {/* Icon */}
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
              d.is_overdue
                ? 'bg-rose-500/10 text-rose-400'
                : d.status === 'partially_received'
                  ? 'bg-amber-500/10 text-amber-400'
                  : 'bg-sky-500/10 text-sky-400'
            }`}
          >
            {d.is_overdue ? (
              <AlertTriangle className="h-5 w-5" />
            ) : (
              <Package className="h-5 w-5" />
            )}
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-100">
                {d.po_number}
              </span>
              {d.is_overdue && (
                <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-medium text-rose-300">
                  Overdue
                </span>
              )}
              {d.status === 'partially_received' && (
                <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                  Partial
                </span>
              )}
            </div>
            <p className="truncate text-xs text-slate-400">{d.supplier_name}</p>
            <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-500">
              <span>{d.line_count} items</span>
              {d.expected_date && (
                <span>
                  Expected: {new Date(d.expected_date).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
              )}
            </div>
          </div>

          {/* Arrow */}
          <ChevronRight className="h-5 w-5 shrink-0 text-slate-600 transition group-hover:text-sky-400" />
        </button>
      ))}
    </div>
  )
}
