import { CalendarClock, Rocket, ShieldAlert, RefreshCw } from 'lucide-react'

/* ─── Lock Day countdown ─── */

function daysUntil(isoDate: string): number {
  const target = new Date(isoDate + 'T00:00:00')
  const now = new Date()
  const diff = target.getTime() - now.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function formatLockDay(isoDate: string): string {
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  })
}

/* ─── Component ─── */

interface RoadmapHeaderProps {
  overallProgress: number
  totalBlockers: number
  lockDay: string | undefined
  onRefresh: () => void
  isLoading: boolean
}

export function RoadmapHeader({
  overallProgress,
  totalBlockers,
  lockDay,
  onRefresh,
  isLoading,
}: RoadmapHeaderProps) {
  const daysLeft = lockDay ? daysUntil(lockDay) : null
  const lockDayFormatted = lockDay ? formatLockDay(lockDay) : null
  const isUrgent = daysLeft !== null && daysLeft <= 3
  const isOverdue = daysLeft !== null && daysLeft <= 0

  return (
    <div className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/90 p-5 sm:p-6">
      {/* ── Ambient glow ── */}
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-emerald-500/[0.04] blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-amber-500/[0.03] blur-3xl" />

      {/* ── Title row ── */}
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/5 text-emerald-400 shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-500/20">
            <Rocket className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-50">
              Opening Roadmap
            </h1>
            <p className="text-xs text-zinc-500">
              L2 Phuket — launch preparation
            </p>
          </div>
        </div>

        {/* Refresh */}
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-50"
          title="Refresh data"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`}
          />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {/* ── Lock Day hero countdown ── */}
      {lockDay && daysLeft !== null && (
        <div
          className={[
            'relative mt-4 flex items-center gap-4 rounded-xl border px-4 py-3 sm:px-5',
            isOverdue
              ? 'border-red-800/60 bg-red-950/40'
              : isUrgent
                ? 'border-amber-800/50 bg-amber-950/30'
                : 'border-zinc-700/40 bg-zinc-800/30',
          ].join(' ')}
        >
          {/* Pulse dot for urgency */}
          {isUrgent && !isOverdue && (
            <span className="absolute -left-1 -top-1 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-40" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-500" />
            </span>
          )}
          {isOverdue && (
            <span className="absolute -left-1 -top-1 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-40" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
            </span>
          )}

          <CalendarClock
            className={[
              'h-5 w-5 shrink-0',
              isOverdue
                ? 'text-red-400'
                : isUrgent
                  ? 'text-amber-400'
                  : 'text-zinc-400',
            ].join(' ')}
          />

          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-zinc-400">
              Recipe Lock Day
            </p>
            <p
              className={[
                'text-sm font-semibold',
                isOverdue
                  ? 'text-red-300'
                  : isUrgent
                    ? 'text-amber-200'
                    : 'text-zinc-200',
              ].join(' ')}
            >
              {lockDayFormatted} — no experiments after this date
            </p>
          </div>

          <div
            className={[
              'shrink-0 text-right',
              isOverdue
                ? 'text-red-300'
                : isUrgent
                  ? 'text-amber-300'
                  : 'text-zinc-300',
            ].join(' ')}
          >
            <p className="text-2xl font-black tabular-nums leading-none sm:text-3xl">
              {isOverdue ? 0 : daysLeft}
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
              {isOverdue ? 'overdue' : daysLeft === 1 ? 'day left' : 'days left'}
            </p>
          </div>
        </div>
      )}

      {/* ── Stats strip ── */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {/* Overall progress */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="shrink-0 text-xs font-medium text-zinc-500">
            Progress
          </span>
          <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.3)] transition-all duration-1000 ease-out"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
          <span className="w-10 shrink-0 text-right text-sm font-bold tabular-nums text-zinc-100">
            {overallProgress}%
          </span>
        </div>

        {/* Blockers badge */}
        {totalBlockers > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-red-900/40 px-2.5 py-1.5 text-xs font-semibold text-red-300 ring-1 ring-red-800/40">
            <ShieldAlert className="h-3.5 w-3.5" />
            {totalBlockers} {totalBlockers === 1 ? 'blocker' : 'blockers'}
          </span>
        )}
      </div>
    </div>
  )
}
