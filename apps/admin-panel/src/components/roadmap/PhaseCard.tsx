import { ChevronDown, ShieldAlert } from 'lucide-react'
import type { PhaseData } from '../../hooks/useOpeningRoadmap'
import type { PhaseStatus } from './roadmap-config'
import { PhaseTaskList } from './PhaseTaskList'

/* ─── Status badge ─── */

const STATUS_STYLES: Record<PhaseStatus, { label: string; className: string }> =
  {
    done: {
      label: 'Done',
      className: 'bg-emerald-950/50 text-emerald-300 ring-emerald-800/40',
    },
    in_progress: {
      label: 'In Progress',
      className: 'bg-amber-950/50 text-amber-300 ring-amber-800/40',
    },
    blocked: {
      label: 'Blocked',
      className: 'bg-red-950/50 text-red-300 ring-red-800/40',
    },
    not_started: {
      label: 'Not Started',
      className: 'bg-zinc-800/60 text-zinc-500 ring-zinc-700/40',
    },
  }

/* ─── Progress bar fill color ─── */

function progressBarColor(status: PhaseStatus): string {
  if (status === 'done') return 'bg-emerald-400'
  if (status === 'blocked') return 'bg-amber-500'
  return 'bg-emerald-500'
}

/* ─── Component ─── */

interface PhaseCardProps {
  phase: PhaseData
  isExpanded: boolean
  isCurrent: boolean
  onToggle: () => void
}

export function PhaseCard({
  phase,
  isExpanded,
  isCurrent,
  onToggle,
}: PhaseCardProps) {
  const { config, tasks, progress, blockerCount, status } = phase
  const Icon = config.icon
  const statusStyle = STATUS_STYLES[status]

  return (
    <div
      className={[
        'overflow-hidden rounded-xl border transition-all duration-200',
        isCurrent
          ? 'border-emerald-500/30 bg-zinc-900/80 ring-2 ring-emerald-500/20'
          : 'border-zinc-800 bg-zinc-900/60',
        status === 'done' ? 'opacity-70' : '',
      ].join(' ')}
    >
      {/* ── Phase header (clickable) ── */}
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-zinc-800/30"
      >
        {/* Phase icon */}
        <span
          className={[
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            isCurrent
              ? 'bg-emerald-500/15 text-emerald-400'
              : status === 'done'
                ? 'bg-zinc-800/80 text-zinc-500'
                : 'bg-zinc-800 text-zinc-400',
          ].join(' ')}
        >
          <Icon className="h-4.5 w-4.5" />
        </span>

        {/* Title + subtitle */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-zinc-100">
              {config.title}
            </span>
            {isCurrent && (
              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                current
              </span>
            )}
          </div>
          <p className="truncate text-xs text-zinc-500">{config.subtitle}</p>
        </div>

        {/* Right side: stats + chevron */}
        <div className="flex shrink-0 items-center gap-2.5">
          {/* Blocker count */}
          {blockerCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-red-900/50 px-1.5 py-0.5 text-[10px] font-semibold text-red-300 ring-1 ring-red-800/50">
              <ShieldAlert className="h-3 w-3" />
              {blockerCount}
            </span>
          )}

          {/* Status badge */}
          <span
            className={`hidden rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 sm:inline-flex ${statusStyle.className}`}
          >
            {statusStyle.label}
          </span>

          {/* Progress text */}
          <span className="w-8 text-right text-xs tabular-nums text-zinc-400">
            {progress}%
          </span>

          {/* Chevron */}
          <ChevronDown
            className={[
              'h-4 w-4 text-zinc-600 transition-transform duration-200',
              isExpanded ? 'rotate-0' : '-rotate-90',
            ].join(' ')}
          />
        </div>
      </button>

      {/* ── Progress bar ── */}
      <div className="px-4 pb-1">
        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${progressBarColor(status)}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* ── Expandable task list ── */}
      {isExpanded && (
        <div className="border-t border-zinc-800/60 px-1 pt-1">
          <PhaseTaskList tasks={tasks} />
        </div>
      )}
    </div>
  )
}
