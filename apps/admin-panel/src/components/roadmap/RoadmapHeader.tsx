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

  return (
    <div className="space-y-4">
      {/* ── Title row ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 text-emerald-400 ring-1 ring-emerald-500/20">
            <Rocket className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-zinc-100">
              Opening Roadmap
            </h1>
            <p className="text-xs text-zinc-500">
              L2 launch preparation tracker
            </p>
          </div>
        </div>

        {/* Refresh */}
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-50"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`}
          />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {/* ── Stats strip ── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Overall progress */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="shrink-0 text-xs font-medium text-zinc-400">
            Overall
          </span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-700 ease-out"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
          <span className="w-9 shrink-0 text-right text-sm font-semibold tabular-nums text-zinc-200">
            {overallProgress}%
          </span>
        </div>

        {/* Lock Day badge */}
        {lockDay && daysLeft !== null && (
          <span
            className={[
              'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ring-1',
              daysLeft <= 0
                ? 'bg-red-900/50 text-red-300 ring-red-800/50'
                : daysLeft <= 3
                  ? 'bg-amber-900/50 text-amber-300 ring-amber-800/50'
                  : 'bg-amber-900/40 text-amber-300 ring-amber-800/40',
            ].join(' ')}
          >
            <CalendarClock className="h-3.5 w-3.5" />
            <span>Lock Day: {lockDayFormatted}</span>
            <span className="font-bold">
              {daysLeft <= 0
                ? '(overdue)'
                : daysLeft === 1
                  ? '(1 day left)'
                  : `(${daysLeft} days left)`}
            </span>
          </span>
        )}

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
