import { useNavigate } from 'react-router-dom'
import type { SaleItem } from '../../hooks/useBOMCoverage'

interface BOMHealthBarProps {
  total: number
  withBOM: number
  missing: SaleItem[]
  percentage: number
  isLoading: boolean
  error: string | null
}

export function BOMHealthBar({
  total,
  withBOM,
  missing,
  percentage,
  isLoading,
  error,
}: BOMHealthBarProps) {
  const navigate = useNavigate()

  const barColor =
    percentage >= 80
      ? 'bg-emerald-500'
      : percentage >= 50
      ? 'bg-amber-500'
      : 'bg-rose-500'

  const textColor =
    percentage >= 80
      ? 'text-emerald-400'
      : percentage >= 50
      ? 'text-amber-400'
      : 'text-rose-400'

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/30">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">BOM Coverage</h2>
          <p className="text-xs text-slate-500">SALE dishes with at least one ingredient</p>
        </div>
        {!isLoading && (
          <span className={`text-lg font-bold ${textColor}`}>{percentage}%</span>
        )}
      </div>

      <div className="px-4 py-4">
        {error ? (
          <div className="text-xs text-rose-400">{error}</div>
        ) : isLoading ? (
          <div className="space-y-3">
            <div className="h-3 w-full animate-pulse rounded-full bg-slate-800" />
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex animate-pulse items-center gap-3">
                  <div className="h-2.5 w-24 rounded bg-slate-800" />
                  <div className="h-2.5 flex-1 rounded bg-slate-800" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Progress bar */}
            <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
              <span>{withBOM} covered</span>
              <span>{total} total SALE</span>
            </div>
            <div className="mb-4 h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                style={{ width: `${percentage}%` }}
              />
            </div>

            {/* Missing dishes */}
            {missing.length > 0 ? (
              <div>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  Missing BOM ({missing.length})
                </p>
                <ul className="max-h-32 space-y-1 overflow-y-auto">
                  {missing.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => navigate('/bom')}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] transition hover:bg-slate-800"
                        title={`Open BOM editor for ${item.product_code}`}
                      >
                        <span className="font-mono text-rose-400">{item.product_code}</span>
                        <span className="truncate text-slate-400">{item.name}</span>
                        <span className="ml-auto shrink-0 text-[10px] text-slate-600">
                          → BOM Hub
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : total > 0 ? (
              <p className="text-[11px] text-emerald-400">
                ✓ All SALE dishes have BOM entries
              </p>
            ) : (
              <p className="text-[11px] text-slate-500">No SALE dishes found</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
