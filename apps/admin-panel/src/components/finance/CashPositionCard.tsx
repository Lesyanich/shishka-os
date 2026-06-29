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
      <div className="shk-panel p-4">
        <div className="h-32 animate-pulse rounded-lg bg-[var(--s-2)]" />
      </div>
    )
  }

  const businessTotal = cash
    ? cash.business_cash_thb + cash.business_bank_thb
    : 0

  return (
    <div className="shk-panel p-4">
      <div className="mb-3 flex items-center gap-2">
        <Wallet className="h-4 w-4 text-forest-soft" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-cream/60">
          Cash Position
        </h3>
        {cash && (
          <span className="ml-auto text-[10px] text-cream/30">
            {new Date(cash.snapshot_date).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
            })}
          </span>
        )}
      </div>

      {!cash ? (
        <p className="text-xs text-cream/45">No cash snapshot recorded yet</p>
      ) : (
        <div className="space-y-3">
          {/* Business total — hero number */}
          <div>
            <span className="font-mono text-2xl font-semibold tabular-nums text-cream">
              ฿{formatTHBFull(businessTotal)}
            </span>
            <p className="mt-0.5 text-[10px] text-cream/45">Business available</p>
          </div>

          {/* Breakdown */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-[var(--line)] bg-[var(--s-2)] px-3 py-2">
              <div className="flex items-center gap-1.5">
                <ArrowDownCircle className="h-3 w-3 text-forest-soft" />
                <span className="text-[10px] text-cream/45">Cash</span>
              </div>
              <span className="font-mono text-sm font-semibold tabular-nums text-cream">
                ฿{formatTHBFull(cash.business_cash_thb)}
              </span>
            </div>
            <div className="rounded-lg border border-[var(--line)] bg-[var(--s-2)] px-3 py-2">
              <div className="flex items-center gap-1.5">
                <Building2 className="h-3 w-3 text-honey-300" />
                <span className="text-[10px] text-cream/45">Bank</span>
              </div>
              <span className="font-mono text-sm font-semibold tabular-nums text-cream">
                ฿{formatTHBFull(cash.business_bank_thb)}
              </span>
            </div>
          </div>

          {/* Personal reserve — isolated */}
          {cash.personal_reserve_thb > 0 && (
            <div className="rounded-lg border border-dashed border-[var(--line-strong)] bg-[var(--s-1)] px-3 py-2">
              <div className="flex items-center gap-1.5">
                <ShieldAlert className="h-3 w-3 text-amber-watch" />
                <span className="text-[10px] font-medium text-amber-watch/80">
                  Personal (isolated)
                </span>
              </div>
              <span className="font-mono text-sm font-semibold tabular-nums text-cream/60">
                ฿{formatTHBFull(cash.personal_reserve_thb)}
              </span>
            </div>
          )}

          {/* Notes */}
          {cash.notes && (
            <p className="text-[10px] leading-relaxed text-cream/40">
              {cash.notes}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
