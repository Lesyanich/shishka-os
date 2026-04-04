import { CheckCircle, AlertTriangle, ArrowLeft } from 'lucide-react'
import type { ReceiveGoodsResult } from '../../types/procurement'

interface Props {
  result: ReceiveGoodsResult
  poNumber: string
  onDone: () => void
}

export function ReceivingSummary({ result, poNumber, onDone }: Props) {
  const hasIssues = (result.issue_count ?? 0) > 0

  return (
    <div className="space-y-6 text-center">
      {/* Icon */}
      <div
        className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${
          hasIssues ? 'bg-amber-500/10' : 'bg-emerald-500/10'
        }`}
      >
        {hasIssues ? (
          <AlertTriangle className="h-8 w-8 text-amber-400" />
        ) : (
          <CheckCircle className="h-8 w-8 text-emerald-400" />
        )}
      </div>

      {/* Title */}
      <div>
        <h2 className="text-lg font-bold text-slate-100">
          {hasIssues ? 'Received with Issues' : 'Receiving Complete'}
        </h2>
        <p className="mt-1 text-sm text-slate-500">{poNumber}</p>
      </div>

      {/* Stats */}
      <div className="flex justify-center gap-6">
        <div className="text-center">
          <p className="text-2xl font-bold text-emerald-400">{result.full_count ?? 0}</p>
          <p className="text-xs text-slate-500">OK</p>
        </div>
        {hasIssues && (
          <div className="text-center">
            <p className="text-2xl font-bold text-amber-400">{result.issue_count}</p>
            <p className="text-xs text-slate-500">Issues</p>
          </div>
        )}
      </div>

      {/* PO status */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-3">
        <p className="text-xs text-slate-500">PO Status</p>
        <p className="mt-0.5 text-sm font-semibold text-slate-200">
          {result.po_status === 'received' ? 'Fully Received' : 'Partially Received'}
        </p>
        {result.po_status === 'partially_received' && (
          <p className="mt-1 text-[11px] text-slate-500">
            This PO will remain in the delivery queue until all items are fulfilled.
          </p>
        )}
      </div>

      {/* Done button */}
      <button
        onClick={onDone}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 py-3 text-sm font-semibold text-white transition hover:bg-sky-500 active:scale-[0.99]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Deliveries
      </button>
    </div>
  )
}
