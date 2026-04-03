import { Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'

interface KPICardProps {
  label: string
  value: string | number
  sub?: string
  color: 'emerald' | 'blue' | 'amber' | 'rose'
  icon: ReactNode
  isLoading?: boolean
}

function KPICard({ label, value, sub, color, icon, isLoading }: KPICardProps) {
  const styles = {
    emerald: {
      border: 'border-emerald-500/20',
      bg: 'bg-emerald-500/5',
      icon: 'text-emerald-400',
    },
    blue: {
      border: 'border-blue-500/20',
      bg: 'bg-blue-500/5',
      icon: 'text-blue-400',
    },
    amber: {
      border: 'border-amber-500/20',
      bg: 'bg-amber-500/5',
      icon: 'text-amber-400',
    },
    rose: {
      border: 'border-rose-500/20',
      bg: 'bg-rose-500/5',
      icon: 'text-rose-400',
    },
  }[color]

  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border ${styles.border} ${styles.bg} p-4`}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
        <span className={styles.icon}>{icon}</span>
      </div>
      {isLoading ? (
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
          <div className="h-4 w-16 animate-pulse rounded bg-slate-800" />
        </div>
      ) : (
        <>
          <p className="text-2xl font-bold text-slate-100">{value}</p>
          {sub && <p className="text-[11px] text-slate-500">{sub}</p>}
        </>
      )}
    </div>
  )
}

interface HeroKPIRowProps {
  taskCounts: { pending: number; in_progress: number; completed: number; total: number }
  monthlyCapEx: number
  equipmentTotal: number
  bomPercentage: number
  bomWithBOM: number
  bomTotal: number
  equipmentAlerts: number
  isLoadingTasks: boolean
  isLoadingCapEx: boolean
  isLoadingEquipment: boolean
  isLoadingBOM: boolean
}

export function HeroKPIRow({
  taskCounts,
  monthlyCapEx,
  equipmentTotal,
  bomPercentage,
  bomWithBOM,
  bomTotal,
  equipmentAlerts,
  isLoadingTasks,
  isLoadingCapEx,
  isLoadingEquipment,
  isLoadingBOM,
}: HeroKPIRowProps) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <KPICard
        label="Kitchen Tasks"
        value={taskCounts.total}
        sub={`${taskCounts.in_progress} in progress · ${taskCounts.pending} pending`}
        color="emerald"
        icon={
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        }
        isLoading={isLoadingTasks}
      />
      <KPICard
        label="CapEx This Month"
        value={monthlyCapEx > 0 ? `฿${monthlyCapEx.toLocaleString()}` : '฿0'}
        sub="From capex_transactions"
        color="blue"
        icon={
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
        isLoading={isLoadingCapEx}
      />
      <KPICard
        label="Equipment"
        value={equipmentTotal}
        sub={equipmentAlerts > 0 ? `⚠️ ${equipmentAlerts} need service` : 'All units OK'}
        color={equipmentAlerts > 0 ? 'amber' : 'blue'}
        icon={
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        }
        isLoading={isLoadingEquipment}
      />
      <KPICard
        label="BOM Coverage"
        value={`${bomPercentage}%`}
        sub={`${bomWithBOM} / ${bomTotal} SALE dishes`}
        color={bomPercentage >= 80 ? 'emerald' : bomPercentage >= 50 ? 'amber' : 'rose'}
        icon={
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h7" />
          </svg>
        }
        isLoading={isLoadingBOM}
      />
    </div>
  )
}
