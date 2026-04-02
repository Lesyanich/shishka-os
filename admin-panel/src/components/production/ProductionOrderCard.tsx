import { useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Package,
  Play,
  Ban,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'
import type {
  ProductionOrder,
  ProductionOrderStatus,
} from '../../hooks/useProductionOrders'
import type { Staff } from '../../hooks/useStaff'

// ─── Status / priority config ────────────────────────────────────

const STATUS_CONFIG: Record<
  ProductionOrderStatus,
  { label: string; bg: string; text: string }
> = {
  planned: { label: 'Planned', bg: 'bg-sky-500/15', text: 'text-sky-300' },
  in_progress: { label: 'In Progress', bg: 'bg-amber-500/15', text: 'text-amber-300' },
  completed: { label: 'Completed', bg: 'bg-emerald-500/15', text: 'text-emerald-300' },
  cancelled: { label: 'Cancelled', bg: 'bg-slate-500/15', text: 'text-slate-400' },
}

const PRIORITY_LABELS: Record<number, { label: string; cls: string }> = {
  0: { label: 'Normal', cls: 'text-slate-500' },
  1: { label: 'High', cls: 'text-amber-400' },
  2: { label: 'Urgent', cls: 'text-rose-400' },
}

// ─── Props ───────────────────────────────────────────────────────

interface ProductionOrderCardProps {
  order: ProductionOrder
  staff: Staff[]
  onStart: (id: string) => void
  onCancel: (id: string) => void
  onComplete: (id: string, actualQty: number, wasteQty: number, wasteReason: string) => void
  onAssign: (id: string, staffId: string | null) => void
}

// ─── Component ───────────────────────────────────────────────────

export function ProductionOrderCard({
  order,
  staff,
  onStart,
  onCancel,
  onComplete,
  onAssign,
}: ProductionOrderCardProps) {
  const [rawOpen, setRawOpen] = useState(false)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [actualQty, setActualQty] = useState(order.target_qty)
  const [wasteQty, setWasteQty] = useState(0)
  const [wasteReason, setWasteReason] = useState('')

  const status = STATUS_CONFIG[order.status]
  const priority = PRIORITY_LABELS[order.priority] ?? PRIORITY_LABELS[0]
  const deadline = new Date(order.deadline_at)
  const estimatedStart = order.estimated_start_at ? new Date(order.estimated_start_at) : null

  const fmtTime = (d: Date) =>
    d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  // Equipment timeline mini-bar
  const timelineWidth =
    estimatedStart && order.estimated_duration_min
      ? Math.min(100, Math.max(10, (order.estimated_duration_min / 480) * 100))
      : null

  // Variance for completed orders
  const variance =
    order.status === 'completed' && order.actual_qty != null
      ? order.actual_qty - order.target_qty
      : null

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
      {/* Header: order number + badges */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-slate-500">{order.order_number}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${status.bg} ${status.text}`}>
              {status.label}
            </span>
            {order.priority > 0 && (
              <span className={`text-[10px] font-semibold ${priority.cls}`}>
                {priority.label}
              </span>
            )}
          </div>
          <h3 className="mt-1 text-sm font-semibold text-slate-100 truncate">
            {order.product_name ?? order.product_code ?? 'Unknown product'}
          </h3>
          {order.product_code && (
            <p className="text-[10px] text-slate-500 font-mono">{order.product_code}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-bold text-slate-100">
            {order.target_qty} <span className="text-xs text-slate-400">{order.target_unit}</span>
          </p>
        </div>
      </div>

      {/* Timeline */}
      <div className="flex items-center gap-3 text-[11px] text-slate-400">
        <Clock className="h-3.5 w-3.5 shrink-0" />
        <span>Deadline: {fmtTime(deadline)}</span>
        {estimatedStart && (
          <>
            <span className="text-slate-600">|</span>
            <span>Est. start: {fmtTime(estimatedStart)}</span>
          </>
        )}
        {order.estimated_duration_min != null && (
          <>
            <span className="text-slate-600">|</span>
            <span>{order.estimated_duration_min} min</span>
          </>
        )}
      </div>

      {/* Mini equipment timeline bar */}
      {timelineWidth && (
        <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-500/40"
            style={{ width: `${timelineWidth}%` }}
          />
        </div>
      )}

      {/* Assigned cook */}
      {order.assigned_name && (
        <p className="text-[11px] text-slate-400">
          Cook: <span className="text-slate-200">{order.assigned_name}</span>
        </p>
      )}

      {/* Completed: variance */}
      {order.status === 'completed' && (
        <div className="flex items-center gap-3 text-xs">
          <span className="text-slate-400">
            Actual: <span className="text-slate-100">{order.actual_qty} {order.target_unit}</span>
          </span>
          {variance != null && variance !== 0 && (
            <span className={variance > 0 ? 'text-emerald-400' : 'text-rose-400'}>
              {variance > 0 ? '+' : ''}{variance} {order.target_unit}
            </span>
          )}
          {order.waste_qty > 0 && (
            <span className="text-amber-400">
              Waste: {order.waste_qty} {order.target_unit}
              {order.waste_reason && ` (${order.waste_reason})`}
            </span>
          )}
        </div>
      )}

      {/* Raw requirements (collapsible) */}
      {order.raw_requirements && order.raw_requirements.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setRawOpen(!rawOpen)}
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
          >
            <Package className="h-3 w-3" />
            Raw materials ({order.raw_requirements.length})
            {rawOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {rawOpen && (
            <div className="mt-1.5 rounded-lg bg-slate-800/50 p-2 space-y-1">
              {order.raw_requirements.map((r, i) => (
                <div key={i} className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-300 font-mono">{r.product_code}</span>
                  <span className="text-slate-400">
                    {r.qty} {r.unit}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Action buttons based on status */}
      {order.status === 'planned' && (
        <div className="flex items-center gap-2 pt-1">
          <select
            value={order.assigned_to ?? ''}
            onChange={(e) => onAssign(order.id, e.target.value || null)}
            className="h-7 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2 text-[11px] text-slate-100 focus:border-emerald-500 focus:outline-none"
          >
            <option value="">Assign Cook...</option>
            {staff
              .filter((s) => s.is_active && (s.role === 'cook' || s.role === 'sous_chef'))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
          <button
            type="button"
            onClick={() => onStart(order.id)}
            className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-emerald-500 transition-colors"
          >
            <Play className="h-3 w-3" /> Start
          </button>
          <button
            type="button"
            onClick={() => onCancel(order.id)}
            className="flex items-center gap-1 rounded-lg bg-slate-700 px-3 py-1.5 text-[11px] font-medium text-slate-300 hover:bg-slate-600 transition-colors"
          >
            <Ban className="h-3 w-3" /> Cancel
          </button>
        </div>
      )}

      {order.status === 'in_progress' && !completeOpen && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setCompleteOpen(true)}
            className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-emerald-500 transition-colors"
          >
            <CheckCircle2 className="h-3 w-3" /> Complete
          </button>
        </div>
      )}

      {/* Complete modal inline */}
      {order.status === 'in_progress' && completeOpen && (
        <div className="rounded-lg border border-slate-700 bg-slate-800/80 p-3 space-y-2">
          <p className="text-xs font-medium text-slate-200">Complete Production</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-slate-400 mb-0.5">Actual qty</label>
              <input
                type="number"
                value={actualQty}
                onChange={(e) => setActualQty(parseFloat(e.target.value) || 0)}
                className="h-7 w-full rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-0.5">Waste qty</label>
              <input
                type="number"
                value={wasteQty}
                onChange={(e) => setWasteQty(parseFloat(e.target.value) || 0)}
                className="h-7 w-full rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100 focus:outline-none"
              />
            </div>
          </div>
          {wasteQty > 0 && (
            <input
              type="text"
              placeholder="Waste reason..."
              value={wasteReason}
              onChange={(e) => setWasteReason(e.target.value)}
              className="h-7 w-full rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100 focus:outline-none"
            />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                onComplete(order.id, actualQty, wasteQty, wasteReason)
                setCompleteOpen(false)
              }}
              className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-emerald-500 transition-colors"
            >
              <CheckCircle2 className="h-3 w-3" /> Confirm
            </button>
            <button
              type="button"
              onClick={() => setCompleteOpen(false)}
              className="rounded-lg bg-slate-700 px-3 py-1.5 text-[11px] text-slate-300 hover:bg-slate-600 transition-colors"
            >
              Cancel
            </button>
          </div>
          {(actualQty < order.target_qty || wasteQty > 0) && (
            <p className="flex items-center gap-1 text-[10px] text-amber-400">
              <AlertTriangle className="h-3 w-3" />
              Target: {order.target_qty} {order.target_unit}, Actual: {actualQty}, Waste: {wasteQty}
            </p>
          )}
        </div>
      )}

      {/* Notes */}
      {order.notes && (
        <p className="text-[11px] text-slate-500 italic">{order.notes}</p>
      )}
    </div>
  )
}
