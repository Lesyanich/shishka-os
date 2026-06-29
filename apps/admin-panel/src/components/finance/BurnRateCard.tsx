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
      <div className="shk-panel p-4">
        <div className="h-32 animate-pulse rounded-lg bg-[var(--s-2)]" />
      </div>
    )
  }

  const dailyBurn = burnRate.daily30d > 0 ? burnRate.daily30d : burnRate.daily7d
  const monthlyBurn = dailyBurn * 30

  // Color coding: green <2k/day, amber 2-4k, red >4k (brand-retoned)
  const burnColor =
    dailyBurn > 4000
      ? 'text-brick-bright'
      : dailyBurn > 2000
        ? 'text-amber-watch'
        : 'text-mint-200'

  return (
    <div className="shk-panel p-4">
      <div className="mb-3 flex items-center gap-2">
        <Flame className="h-4 w-4 text-brick-bright" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-cream/60">
          Burn Rate
        </h3>
      </div>

      <div className="space-y-3">
        {/* Daily burn — hero number */}
        <div>
          <span className={`font-mono text-2xl font-semibold tabular-nums ${burnColor}`}>
            ฿{formatTHBFull(Math.round(dailyBurn))}
          </span>
          <span className="ml-1 text-xs text-cream/45">/day</span>
        </div>

        {/* 7-day vs 30-day comparison */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-[var(--line)] bg-[var(--s-2)] px-3 py-2">
            <p className="text-[10px] text-cream/45">7-day avg</p>
            <span className="font-mono text-sm font-semibold tabular-nums text-cream">
              ฿{formatTHBFull(Math.round(burnRate.daily7d))}
              <span className="text-[10px] text-cream/45">/d</span>
            </span>
          </div>
          <div className="rounded-lg border border-[var(--line)] bg-[var(--s-2)] px-3 py-2">
            <p className="text-[10px] text-cream/45">30-day avg</p>
            <span className="font-mono text-sm font-semibold tabular-nums text-cream">
              ฿{formatTHBFull(Math.round(burnRate.daily30d))}
              <span className="text-[10px] text-cream/45">/d</span>
            </span>
          </div>
        </div>

        {/* Monthly projection */}
        <div className="rounded-lg border border-[var(--line)] bg-[var(--s-2)] px-3 py-2">
          <p className="text-[10px] text-cream/45">Monthly projection</p>
          <span className="font-mono text-sm font-semibold tabular-nums text-cream">
            ฿{formatTHBFull(Math.round(monthlyBurn))}
            <span className="text-[10px] text-cream/45">/mo</span>
          </span>
        </div>

        {/* Totals */}
        <div className="flex justify-between text-[10px] text-cream/40">
          <span>7d total: ฿{formatTHBFull(Math.round(burnRate.total7d))}</span>
          <span>30d total: ฿{formatTHBFull(Math.round(burnRate.total30d))}</span>
        </div>
      </div>
    </div>
  )
}
