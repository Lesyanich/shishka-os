import { AlertTriangle } from 'lucide-react'
import type { BusinessTask } from '../../hooks/useBusinessTasks'

// ── Domain badge colors ──────────────────────────────────────────────────────

const DOMAIN_COLORS: Record<string, string> = {
  kitchen: 'bg-nutri-fat/25 text-cream/90',
  procurement: 'bg-amber-watch/20 text-amber-watch',
  finance: 'bg-forest-soft/20 text-mint-200',
  marketing: 'bg-nutri-car/25 text-cream/90',
  ops: 'bg-honey-300/20 text-honey-300',
  sales: 'bg-brick-soft/20 text-brick-bright',
  strategy: 'bg-honey-600/25 text-honey-300',
  tech: 'bg-nutri-pro/30 text-cream/90',
}

// ── Avatar config per assignee ───────────────────────────────────────────────

interface AvatarConfig {
  shape: string // Tailwind rounded-* class
  symbol: string // display character
  bg: string // background Tailwind class
  text: string // text color Tailwind class
}

function resolveAvatar(assignedTo: string | null): AvatarConfig {
  if (!assignedTo) {
    return { shape: 'rounded-full', symbol: '?', bg: 'bg-[var(--s-3)]', text: 'text-cream/60' }
  }

  const key = assignedTo.toLowerCase()

  // Agent assignees
  if (key === 'code') {
    return { shape: 'rounded-[4px]', symbol: '◈', bg: 'bg-nutri-car/20', text: 'text-nutri-car' }
  }
  if (key === 'chef') {
    return { shape: 'rounded-[4px]', symbol: '◈', bg: 'bg-nutri-fat/20', text: 'text-nutri-fat' }
  }
  if (key === 'finance') {
    return { shape: 'rounded-[4px]', symbol: '◈', bg: 'bg-forest-soft/20', text: 'text-mint-200' }
  }

  // Human assignees — use first letter
  const humanColors: Record<string, { bg: string; text: string }> = {
    lesia: { bg: 'bg-forest-soft/20', text: 'text-mint-200' },
    bas: { bg: 'bg-honey-300/20', text: 'text-honey-300' },
  }
  const colors = humanColors[key] ?? { bg: 'bg-[var(--s-3)]', text: 'text-cream/80' }

  return {
    shape: 'rounded-full',
    symbol: assignedTo[0].toUpperCase(),
    bg: colors.bg,
    text: colors.text,
  }
}

// ── Size badge ───────────────────────────────────────────────────────────────

const SIZE_LABELS = ['XL', 'L', 'M', 'S']

function detectSize(tags: string[]): string {
  const upper = tags.map((t) => t.toUpperCase())
  for (const size of SIZE_LABELS) {
    if (upper.includes(size)) return size
  }
  return 'M'
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface FocusCardProps {
  task: BusinessTask
  onClick?: (task: BusinessTask) => void
}

// ── Component ────────────────────────────────────────────────────────────────

export function FocusCard({ task, onClick }: FocusCardProps) {
  const isBlocked = task.status === 'blocked'
  const accentBar = isBlocked ? 'bg-[var(--color-royal-red)]' : 'bg-amber-watch'

  const statusBadge = isBlocked
    ? 'bg-brick-soft/15 text-brick-bright border border-brick-soft/30'
    : 'bg-amber-watch/15 text-amber-watch border border-amber-watch/30'
  const statusLabel = isBlocked ? 'Blocked' : 'In Progress'

  const shortId = task.id.replace(/-/g, '').slice(0, 8)
  const domainColor = DOMAIN_COLORS[task.domain] ?? 'bg-[var(--s-3)] text-cream/80'
  const size = detectSize(task.tags)
  const avatar = resolveAvatar(task.assigned_to)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick?.(task)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick?.(task)
      }}
      className={[
        'relative flex flex-col gap-2 cursor-pointer select-none',
        'min-w-[300px] max-w-[360px] flex-shrink-0',
        'rounded-xl border border-[var(--line)] bg-[var(--s-1)]',
        'px-4 py-3 pl-5 overflow-hidden',
        'transition-all duration-150',
        'hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-watch/50',
      ].join(' ')}
    >
      {/* Left accent bar */}
      <span className={`absolute left-0 top-0 h-full w-[3px] ${accentBar} rounded-l-xl`} />

      {/* Row 1: title + status badge */}
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-cream flex-1">
          {task.title}
        </p>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadge}`}
        >
          {statusLabel}
        </span>
      </div>

      {/* Row 2: task ID + domain badge + size badge */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-[10px] text-cream/45">#{shortId}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${domainColor}`}>
          {task.domain}
        </span>
        <span className="rounded-full bg-[var(--s-3)] px-2 py-0.5 text-[10px] font-medium text-cream/60">
          {size}
        </span>
      </div>

      {/* Blocker note (only when blocked + notes exist) */}
      {isBlocked && task.notes && (
        <div className="flex items-start gap-2 rounded-lg bg-brick-soft/10 border border-brick-soft/20 px-3 py-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brick-bright" />
          <p className="text-[11px] leading-snug text-brick-bright line-clamp-3">{task.notes}</p>
        </div>
      )}

      {/* Bottom row: assignee avatar + name */}
      <div className="flex items-center gap-2 mt-auto pt-1">
        <span
          className={[
            'flex h-6 w-6 items-center justify-center text-[11px] font-bold shrink-0',
            avatar.shape,
            avatar.bg,
            avatar.text,
          ].join(' ')}
        >
          {avatar.symbol}
        </span>
        <span className="truncate text-[11px] text-cream/60">
          {task.assigned_to ?? 'Unassigned'}
        </span>
      </div>
    </div>
  )
}
