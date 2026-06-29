import { TrendingDown, TrendingUp } from 'lucide-react'

export interface KpiCardProps {
  label: string
  value: string
  delta?: number
  isLoading: boolean
}

export function KpiCard({ label, value, delta, isLoading }: KpiCardProps) {
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
                  delta > 0 ? 'text-brick-bright' : 'text-mint-200'
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
