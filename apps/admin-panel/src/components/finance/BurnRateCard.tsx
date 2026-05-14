import { Flame } from 'lucide-react'
import type { BurnRate } from '../../hooks/useFinanceDashboard'
import { formatTHBFull } from './helpers'

interface BurnRateCardProps {
  burnRate: BurnRate
  isLoading: boolean
}

export function BurnRateCard({ burnRate, isLoading }: BurnRateCardProps) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="h-32 animate-pulse rounded-lg bg-slate-800/50" />
      </div>
    )
  }

  const dailyBurn = burnRate.daily30d > 0 ? burnRate.daily30d : burnRate.daily7d
  const monthlyBurn = dailyBurn * 30

  // Color coding: green <2k/day, amber 2-4k, red >4k
  const burnColor =
    dailyBurn > 4000
      ? 'text-rose-400'
      : dailyBurn > 2000
        ? 'text-amber-400'
        : 'text-emerald-400'

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Flame className="h-4 w-4 text-rose-400" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Burn Rate
        </h3>
      </div>

      <div className="space-y-3">
        {/* Daily burn — hero number */}
        <div>
          <span className={`text-2xl font-bold tabular-nums ${burnColor}`}>
            ฿{formatTHBFull(Math.round(dailyBurn))}
          </span>
          <span className="ml-1 text-xs text-slate-500">/day</span>
        </div>

        {/* 7-day vs 30-day comparison */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-slate-800/40 px-3 py-2">
            <p className="text-[10px] text-slate-500">7-day avg</p>
            <span className="text-sm font-semibold tabular-nums text-slate-200">
              ฿{formatTHBFull(Math.round(burnRate.daily7d))}
              <span className="text-[10px] text-slate-500">/d</span>
            </span>
          </div>
          <div className="rounded-lg bg-slate-800/40 px-3 py-2">
            <p className="text-[10px] text-slate-500">30-day avg</p>
            <span className="text-sm font-semibold tabular-nums text-slate-200">
              ฿{formatTHBFull(Math.round(burnRate.daily30d))}
              <span className="text-[10px] text-slate-500">/d</span>
            </span>
          </div>
        </div>

        {/* Monthly projection */}
        <div className="rounded-lg bg-slate-800/40 px-3 py-2">
          <p className="text-[10px] text-slate-500">Monthly projection</p>
          <span className="text-sm font-semibold tabular-nums text-slate-200">
            ฿{formatTHBFull(Math.round(monthlyBurn))}
            <span className="text-[10px] text-slate-500">/mo</span>
          </span>
        </div>

        {/* Totals */}
        <div className="flex justify-between text-[10px] text-slate-600">
          <span>7d total: ฿{formatTHBFull(Math.round(burnRate.total7d))}</span>
          <span>30d total: ฿{formatTHBFull(Math.round(burnRate.total30d))}</span>
        </div>
      </div>
    </div>
  )
}
