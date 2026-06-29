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
      <div className="shk-panel p-4">
        <div className="h-20 animate-pulse rounded-lg bg-[var(--s-2)]" />
      </div>
    )
  }

  // Color zones: <30d red, 30-60d amber, 60-90d yellow-green, >90d green
  const clampedDays = Math.min(runwayDays, 180)
  const pct = Math.min((clampedDays / 180) * 100, 100)

  const zone = getZone(runwayDays)

  return (
    <div className="shk-panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className={`h-4 w-4 ${zone.iconColor}`} />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-cream/60">
            Runway
          </h3>
        </div>
        {runwayDays < 30 && (
          <span className="flex items-center gap-1 rounded-full bg-brick-soft/15 px-2 py-0.5 text-[10px] font-semibold text-brick-bright">
            <AlertTriangle className="h-3 w-3" />
            Critical
          </span>
        )}
      </div>

      {/* Days number — big */}
      <div className="mb-3 flex items-baseline gap-2">
        <span className={`font-mono text-3xl font-semibold tabular-nums ${zone.textColor}`}>
          {runwayDays > 365 ? '365+' : runwayDays}
        </span>
        <span className="text-sm text-cream/45">days</span>
        <span className="ml-auto text-[10px] text-cream/30">
          at ฿{dailyBurn > 0 ? Math.round(dailyBurn).toLocaleString('en-US') : '—'}/day
        </span>
      </div>

      {/* Progress bar */}
      <div className="relative h-3 overflow-hidden rounded-full bg-[var(--s-2)]">
        {/* Gradient fill */}
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${zone.barColor}`}
          style={{ width: `${pct}%` }}
        />

        {/* Zone markers */}
        <div className="absolute inset-0 flex">
          <div className="w-[16.7%] border-r border-[var(--line-strong)]" />  {/* 30d */}
          <div className="w-[16.7%] border-r border-[var(--line-strong)]" />  {/* 60d */}
          <div className="w-[16.7%] border-r border-[var(--line-strong)]" />  {/* 90d */}
        </div>
      </div>

      {/* Scale labels */}
      <div className="mt-1 flex text-[9px] text-cream/30">
        <span className="w-[16.7%]">30d</span>
        <span className="w-[16.7%]">60d</span>
        <span className="w-[16.7%]">90d</span>
        <span className="flex-1 text-right">180d</span>
      </div>

      {/* Context line */}
      {totalCash > 0 && dailyBurn > 0 && (
        <p className="mt-2 text-[10px] text-cream/40">
          ฿{Math.round(totalCash).toLocaleString('en-US')} cash ÷ ฿{Math.round(dailyBurn).toLocaleString('en-US')}/day burn
        </p>
      )}
    </div>
  )
}

function getZone(days: number) {
  if (days < 30) return {
    textColor: 'text-brick-bright',
    iconColor: 'text-brick-bright',
    barColor: 'bg-gradient-to-r from-brick-soft to-brick-bright',
  }
  if (days < 60) return {
    textColor: 'text-amber-watch',
    iconColor: 'text-amber-watch',
    barColor: 'bg-gradient-to-r from-brick-soft via-amber-watch to-amber-watch',
  }
  if (days < 90) return {
    textColor: 'text-honey-300',
    iconColor: 'text-honey-300',
    barColor: 'bg-gradient-to-r from-amber-watch via-honey-600 to-honey-300',
  }
  return {
    textColor: 'text-mint-200',
    iconColor: 'text-forest-soft',
    barColor: 'bg-gradient-to-r from-royal-green via-forest-soft to-mint-200',
  }
}
