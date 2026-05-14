import { RefreshCw } from 'lucide-react'
import { useFinanceDashboard } from '../hooks/useFinanceDashboard'
import { CashPositionCard } from '../components/finance/CashPositionCard'
import { BurnRateCard } from '../components/finance/BurnRateCard'
import { RunwayGauge } from '../components/finance/RunwayGauge'
import { ObligationsTable } from '../components/finance/ObligationsTable'

export function FinanceDashboard() {
  const {
    latestCash,
    obligations,
    burnRate,
    runwayDays,
    totalOutstanding,
    isLoading,
    error,
    refetch,
  } = useFinanceDashboard()

  const totalBusinessCash = latestCash
    ? latestCash.business_cash_thb + latestCash.business_bank_thb
    : 0

  const dailyBurn = burnRate.daily30d > 0 ? burnRate.daily30d : burnRate.daily7d

  return (
    <div className="space-y-4">
      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-rose-800 bg-rose-950/50 px-4 py-2 text-xs text-rose-300">
          {error}
          <button onClick={refetch} className="ml-2 underline hover:text-rose-200">
            Retry
          </button>
        </div>
      )}

      {/* Top row: Cash + Burn + Runway */}
      <div className="grid gap-4 lg:grid-cols-3">
        <CashPositionCard cash={latestCash} isLoading={isLoading} />
        <BurnRateCard burnRate={burnRate} isLoading={isLoading} />
        <RunwayGauge
          runwayDays={runwayDays}
          totalCash={totalBusinessCash}
          dailyBurn={dailyBurn}
          isLoading={isLoading}
        />
      </div>

      {/* Obligations table — full width */}
      <ObligationsTable
        obligations={obligations}
        totalOutstanding={totalOutstanding}
        isLoading={isLoading}
      />

      {/* Refresh button */}
      <div className="flex justify-end">
        <button
          onClick={refetch}
          disabled={isLoading}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-1.5 text-[10px] text-slate-400 transition hover:bg-slate-800 hover:text-slate-200 disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>
    </div>
  )
}

export default FinanceDashboard
