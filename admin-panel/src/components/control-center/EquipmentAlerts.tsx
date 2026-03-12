import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react'
import type { Equipment } from '../../hooks/useEquipment'

interface EquipmentAlertsProps {
  equipment: Equipment[]
  isLoading: boolean
  error: string | null
}

function statusIcon(status: Equipment['serviceStatus']) {
  if (status === 'overdue')
    return <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
  if (status === 'warning')
    return <Clock className="h-3.5 w-3.5 shrink-0 text-amber-400" />
  return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
}

function statusLabel(item: Equipment) {
  if (item.serviceStatus === 'overdue') {
    return item.daysSinceService == null
      ? 'Never serviced'
      : `${item.daysSinceService}d overdue`
  }
  if (item.serviceStatus === 'warning') {
    return `${item.daysSinceService}d since service`
  }
  return item.last_service_date
    ? new Date(item.last_service_date).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
      })
    : '—'
}

function SkeletonRow() {
  return (
    <div className="flex animate-pulse items-center gap-3 border-b border-slate-800/50 px-4 py-2.5">
      <div className="h-3.5 w-3.5 rounded-full bg-slate-800" />
      <div className="flex-1 space-y-1">
        <div className="h-2.5 w-3/4 rounded bg-slate-800" />
        <div className="h-2 w-1/2 rounded bg-slate-800" />
      </div>
      <div className="h-2.5 w-16 rounded bg-slate-800" />
    </div>
  )
}

export function EquipmentAlerts({ equipment, isLoading, error }: EquipmentAlertsProps) {
  // Show overdue + warning first, then ok — cap at 10 rows
  const sorted = [...equipment]
    .sort((a, b) => {
      const priority = { overdue: 0, warning: 1, ok: 2 }
      return priority[a.serviceStatus] - priority[b.serviceStatus]
    })
    .slice(0, 10)

  const alertCount = equipment.filter((e) => e.serviceStatus !== 'ok').length

  return (
    <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/30">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Equipment</h2>
          <p className="text-xs text-slate-500">Service status — 90-day threshold</p>
        </div>
        {!isLoading && alertCount > 0 && (
          <span className="rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-300">
            {alertCount} alerts
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {error ? (
          <div className="px-4 py-3 text-xs text-rose-400">{error}</div>
        ) : isLoading ? (
          <>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-xs text-slate-500">
            <span className="text-2xl">⚙️</span>
            No equipment found
          </div>
        ) : (
          <ul>
            {sorted.map((item, i) => (
              <li
                key={item.id}
                className={`flex items-center gap-3 px-4 py-2.5 ${
                  i < sorted.length - 1 ? 'border-b border-slate-800/50' : ''
                }`}
              >
                {statusIcon(item.serviceStatus)}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium text-slate-200">{item.name}</p>
                  <p className="text-[10px] text-slate-500">
                    {item.category ?? 'Uncategorized'}
                    {item.equipment_code ? ` · ${item.equipment_code}` : ''}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-[10px] font-medium ${
                    item.serviceStatus === 'overdue'
                      ? 'text-rose-400'
                      : item.serviceStatus === 'warning'
                      ? 'text-amber-400'
                      : 'text-slate-500'
                  }`}
                >
                  {statusLabel(item)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!isLoading && equipment.length > 10 && (
        <div className="border-t border-slate-800 px-4 py-2 text-[11px] text-slate-500">
          Showing 10 of {equipment.length} units
        </div>
      )}
    </div>
  )
}
