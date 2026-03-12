import { TrendingDown, TrendingUp } from 'lucide-react'

export interface KpiCardProps {
  label: string
  value: string
  delta?: number
  isLoading: boolean
}

export function KpiCard({ label, value, delta, isLoading }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3">
      {isLoading ? (
        <div className="h-12 animate-pulse rounded bg-slate-800" />
      ) : (
        <>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-lg font-bold text-slate-100">{value}</span>
            {delta !== undefined && Math.abs(delta) > 0.5 && (
              <span
                className={`flex items-center gap-0.5 text-[10px] font-medium ${
                  delta > 0 ? 'text-rose-400' : 'text-emerald-400'
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
