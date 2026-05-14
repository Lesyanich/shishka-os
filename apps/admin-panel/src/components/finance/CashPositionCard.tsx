import { Wallet, Building2, ShieldAlert, ArrowDownCircle } from 'lucide-react'
import type { CashSnapshot } from '../../hooks/useFinanceDashboard'
import { formatTHBFull } from './helpers'

interface CashPositionCardProps {
  cash: CashSnapshot | null
  isLoading: boolean
}

export function CashPositionCard({ cash, isLoading }: CashPositionCardProps) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="h-32 animate-pulse rounded-lg bg-slate-800/50" />
      </div>
    )
  }

  const businessTotal = cash
    ? cash.business_cash_thb + cash.business_bank_thb
    : 0

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Wallet className="h-4 w-4 text-emerald-400" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Cash Position
        </h3>
        {cash && (
          <span className="ml-auto text-[10px] text-slate-600">
            {new Date(cash.snapshot_date).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
            })}
          </span>
        )}
      </div>

      {!cash ? (
        <p className="text-xs text-slate-500">No cash snapshot recorded yet</p>
      ) : (
        <div className="space-y-3">
          {/* Business total — hero number */}
          <div>
            <span className="text-2xl font-bold tabular-nums text-slate-100">
              ฿{formatTHBFull(businessTotal)}
            </span>
            <p className="mt-0.5 text-[10px] text-slate-500">Business available</p>
          </div>

          {/* Breakdown */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-slate-800/40 px-3 py-2">
              <div className="flex items-center gap-1.5">
                <ArrowDownCircle className="h-3 w-3 text-emerald-500" />
                <span className="text-[10px] text-slate-500">Cash</span>
              </div>
              <span className="text-sm font-semibold tabular-nums text-slate-200">
                ฿{formatTHBFull(cash.business_cash_thb)}
              </span>
            </div>
            <div className="rounded-lg bg-slate-800/40 px-3 py-2">
              <div className="flex items-center gap-1.5">
                <Building2 className="h-3 w-3 text-sky-500" />
                <span className="text-[10px] text-slate-500">Bank</span>
              </div>
              <span className="text-sm font-semibold tabular-nums text-slate-200">
                ฿{formatTHBFull(cash.business_bank_thb)}
              </span>
            </div>
          </div>

          {/* Personal reserve — isolated */}
          {cash.personal_reserve_thb > 0 && (
            <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/30 px-3 py-2">
              <div className="flex items-center gap-1.5">
                <ShieldAlert className="h-3 w-3 text-amber-500" />
                <span className="text-[10px] font-medium text-amber-400/70">
                  Personal (isolated)
                </span>
              </div>
              <span className="text-sm font-semibold tabular-nums text-slate-400">
                ฿{formatTHBFull(cash.personal_reserve_thb)}
              </span>
            </div>
          )}

          {/* Notes */}
          {cash.notes && (
            <p className="text-[10px] leading-relaxed text-slate-600">
              {cash.notes}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
