import { Clock, AlertTriangle } from 'lucide-react'

interface RunwayGaugeProps {
  runwayDays: number
  totalCash: number
  dailyBurn: number
  isLoading: boolean
}

export function RunwayGauge({ runwayDays, totalCash, dailyBurn, isLoading }: RunwayGaugeProps) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="h-20 animate-pulse rounded-lg bg-slate-800/50" />
      </div>
    )
  }

  // Color zones: <30d red, 30-60d amber, 60-90d yellow-green, >90d green
  const clampedDays = Math.min(runwayDays, 180)
  const pct = Math.min((clampedDays / 180) * 100, 100)

  const zone = getZone(runwayDays)

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className={`h-4 w-4 ${zone.iconColor}`} />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Runway
          </h3>
        </div>
        {runwayDays < 30 && (
          <span className="flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-400">
            <AlertTriangle className="h-3 w-3" />
            Critical
          </span>
        )}
      </div>

      {/* Days number — big */}
      <div className="mb-3 flex items-baseline gap-2">
        <span className={`text-3xl font-bold tabular-nums ${zone.textColor}`}>
          {runwayDays > 365 ? '365+' : runwayDays}
        </span>
        <span className="text-sm text-slate-500">days</span>
        <span className="ml-auto text-[10px] text-slate-600">
          at ฿{dailyBurn > 0 ? Math.round(dailyBurn).toLocaleString('en-US') : '—'}/day
        </span>
      </div>

      {/* Progress bar */}
      <div className="relative h-3 overflow-hidden rounded-full bg-slate-800">
        {/* Gradient fill */}
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${zone.barColor}`}
          style={{ width: `${pct}%` }}
        />

        {/* Zone markers */}
        <div className="absolute inset-0 flex">
          <div className="w-[16.7%] border-r border-slate-700/50" />  {/* 30d */}
          <div className="w-[16.7%] border-r border-slate-700/50" />  {/* 60d */}
          <div className="w-[16.7%] border-r border-slate-700/50" />  {/* 90d */}
        </div>
      </div>

      {/* Scale labels */}
      <div className="mt-1 flex text-[9px] text-slate-600">
        <span className="w-[16.7%]">30d</span>
        <span className="w-[16.7%]">60d</span>
        <span className="w-[16.7%]">90d</span>
        <span className="flex-1 text-right">180d</span>
      </div>

      {/* Context line */}
      {totalCash > 0 && dailyBurn > 0 && (
        <p className="mt-2 text-[10px] text-slate-600">
          ฿{Math.round(totalCash).toLocaleString('en-US')} cash ÷ ฿{Math.round(dailyBurn).toLocaleString('en-US')}/day burn
        </p>
      )}
    </div>
  )
}

function getZone(days: number) {
  if (days < 30) return {
    textColor: 'text-rose-400',
    iconColor: 'text-rose-400',
    barColor: 'bg-gradient-to-r from-rose-600 to-rose-500',
  }
  if (days < 60) return {
    textColor: 'text-amber-400',
    iconColor: 'text-amber-400',
    barColor: 'bg-gradient-to-r from-rose-600 via-amber-500 to-amber-400',
  }
  if (days < 90) return {
    textColor: 'text-yellow-300',
    iconColor: 'text-yellow-400',
    barColor: 'bg-gradient-to-r from-rose-600 via-amber-500 to-yellow-400',
  }
  return {
    textColor: 'text-emerald-400',
    iconColor: 'text-emerald-400',
    barColor: 'bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-400',
  }
}
