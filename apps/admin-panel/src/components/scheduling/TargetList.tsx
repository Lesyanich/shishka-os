import { Trash2 } from 'lucide-react'
import type { ProductionTarget, TargetStatus } from '../../types/scheduling'
import type { UseProductionTargetsResult } from '../../hooks/useProductionTargets'
import { ChannelBadge } from './ChannelBadge'

const statusConfig: Record<TargetStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-zinc-700/60 text-zinc-400' },
  confirmed: { label: 'Confirmed', className: 'bg-emerald-500/20 text-emerald-400' },
  scheduled: { label: 'Scheduled', className: 'bg-blue-500/20 text-blue-400' },
}

interface TargetListProps {
  targets: ProductionTarget[]
  isLoading: boolean
  onUpdate: UseProductionTargetsResult['updateTarget']
  onDelete: UseProductionTargetsResult['deleteTarget']
  onConfirmAll: () => Promise<{ ok: boolean; error?: string }>
}

export function TargetList({ targets, isLoading, onDelete, onConfirmAll }: TargetListProps) {
  const hasDrafts = targets.some((t) => t.status === 'draft')

  if (isLoading) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-center text-sm text-zinc-500">
        Loading targets…
      </div>
    )
  }

  if (targets.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-center text-sm text-zinc-500">
        No targets for this date. Add one above.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-300">
          Targets <span className="ml-1 text-xs text-zinc-500">({targets.length})</span>
        </h2>
        {hasDrafts && (
          <button
            onClick={onConfirmAll}
            className="rounded-lg bg-zinc-700 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-zinc-600 transition-colors"
          >
            Confirm All Drafts
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
              <th className="px-4 py-2 font-medium">Product</th>
              <th className="px-4 py-2 font-medium">Channel</th>
              <th className="px-4 py-2 font-medium text-right">Qty</th>
              <th className="px-4 py-2 font-medium">Deadline</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {targets.map((target) => {
              const status = statusConfig[target.status]
              const deadlineTime = target.deadline_at
                ? new Date(target.deadline_at).toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '—'

              return (
                <tr key={target.id} className="hover:bg-zinc-800/40 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-zinc-100">
                      {target.nomenclature?.name ?? target.nomenclature_id}
                    </p>
                    {target.nomenclature?.product_code && (
                      <p className="text-xs text-zinc-500">{target.nomenclature.product_code}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <ChannelBadge channel={target.channel} />
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-zinc-200">
                    {target.target_qty}
                  </td>
                  <td className="px-4 py-3 font-mono text-zinc-300">
                    {deadlineTime}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${status.className}`}
                    >
                      {status.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => onDelete(target.id)}
                      disabled={target.status === 'scheduled'}
                      title="Delete target"
                      className="rounded p-1 text-zinc-600 hover:bg-zinc-700 hover:text-red-400 disabled:opacity-30 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
