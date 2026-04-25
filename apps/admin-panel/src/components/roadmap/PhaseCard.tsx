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

/* ─── Progress bar fill ─── */

function progressBarClasses(status: PhaseStatus): string {
  if (status === 'done')
    return 'bg-gradient-to-r from-emerald-500 to-emerald-400'
  if (status === 'blocked')
    return 'bg-gradient-to-r from-amber-600 to-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.25)]'
  return 'bg-gradient-to-r from-emerald-600 to-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.2)]'
}

/* ─── Component ─── */

interface PhaseCardProps {
  phase: PhaseData
  isExpanded: boolean
  isCurrent: boolean
  onToggle: () => void
  /** 0-based index for stagger animation */
  index: number
  /** Whether this is the last phase (no connector line below) */
  isLast: boolean
}

export function PhaseCard({
  phase,
  isExpanded,
  isCurrent,
  onToggle,
  index,
  isLast,
}: PhaseCardProps) {
  const { config, tasks, progress, blockerCount, status } = phase
  const Icon = config.icon
  const statusStyle = STATUS_STYLES[status]

  return (
    <div
      className="relative flex gap-0 sm:gap-4"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      {/* ── Timeline column ── */}
      <div className="hidden w-10 shrink-0 flex-col items-center sm:flex">
        {/* Phase number circle */}
        <div
          className={[
            'relative z-10 flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold transition-all duration-300',
            isCurrent
              ? 'bg-emerald-500 text-zinc-950 shadow-lg shadow-emerald-500/30'
              : status === 'done'
                ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30'
                : 'bg-zinc-800 text-zinc-500 ring-1 ring-zinc-700',
          ].join(' ')}
        >
          {status === 'done' ? (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            config.id
          )}
        </div>
        {/* Connecting line */}
        {!isLast && (
          <div
            className={[
              'w-px flex-1',
              status === 'done'
                ? 'bg-gradient-to-b from-emerald-500/40 to-emerald-500/10'
                : 'bg-zinc-800',
            ].join(' ')}
          />
        )}
      </div>

      {/* ── Phase card ── */}
      <div
        className={[
          'mb-2 min-w-0 flex-1 overflow-hidden rounded-xl border transition-all duration-300',
          isCurrent
            ? 'border-emerald-500/30 bg-zinc-900/90 shadow-lg shadow-emerald-500/[0.06] ring-1 ring-emerald-500/20'
            : status === 'done'
              ? 'border-zinc-800/60 bg-zinc-900/40 opacity-60'
              : 'border-zinc-800 bg-zinc-900/70 hover:border-zinc-700',
        ].join(' ')}
      >
        {/* ── Phase header (clickable) ── */}
        <button
          onClick={onToggle}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-zinc-800/20"
        >
          {/* Phase icon */}
          <span
            className={[
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-300',
              isCurrent
                ? 'bg-emerald-500/15 text-emerald-400'
                : status === 'done'
                  ? 'bg-zinc-800/80 text-zinc-500'
                  : 'bg-zinc-800 text-zinc-400',
            ].join(' ')}
          >
            <Icon className="h-[18px] w-[18px]" />
          </span>

          {/* Title + subtitle */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {/* Mobile-only phase number */}
              <span className="text-xs font-medium text-zinc-600 sm:hidden">
                {config.id}.
              </span>
              <span className="text-sm font-semibold text-zinc-100">
                {config.title}
              </span>
              {isCurrent && (
                <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                  focus
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
            <span className="w-8 text-right text-xs font-semibold tabular-nums text-zinc-400">
              {progress}%
            </span>

            {/* Chevron */}
            <ChevronDown
              className={[
                'h-4 w-4 text-zinc-600 transition-transform duration-300',
                isExpanded ? 'rotate-0' : '-rotate-90',
              ].join(' ')}
            />
          </div>
        </button>

        {/* ── Progress bar ── */}
        <div className="px-4 pb-1.5">
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${progressBarClasses(status)}`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* ── Expandable task list ── */}
        <div
          className={[
            'grid transition-all duration-300 ease-in-out',
            isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
          ].join(' ')}
        >
          <div className="overflow-hidden">
            <div className="border-t border-zinc-800/60 px-1 pt-1">
              <PhaseTaskList tasks={tasks} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
