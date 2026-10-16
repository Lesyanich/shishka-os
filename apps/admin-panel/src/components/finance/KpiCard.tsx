import { TrendingDown, TrendingUp } from 'lucide-react'

export interface KpiCardProps {
  label: string
  value: string
  delta?: number
  isLoading: boolean
  /**
   * Which direction is good news. Finance tracks spend, where a rise is bad —
   * that stays the default. Revenue-style metrics pass 'up' so growth reads
   * green instead of alarm-red.
   */
  goodDirection?: 'up' | 'down'
}

export function KpiCard({ label, value, delta, isLoading, goodDirection = 'down' }: KpiCardProps) {
  const isGoodNews = delta !== undefined && (goodDirection === 'up' ? delta > 0 : delta < 0)
  return (
    <div className="shk-kpi">
      {isLoading ? (
        <div className="h-12 animate-pulse rounded bg-[var(--s-2)]" />
      ) : (
        <>
          <p className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-cream/60">{label}</p>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="font-mono text-xl font-semibold tabular-nums text-cream">{value}</span>
            {delta !== undefined && Math.abs(delta) > 0.5 && (
              <span
                className={`flex items-center gap-0.5 text-[10px] font-medium ${
                  isGoodNews ? 'text-mint-200' : 'text-brick-bright'
                }`}
              >
                {delta > 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {delta > 0 ? '+' : ''}
                {delta.toFixed(1)}% vs prev
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
