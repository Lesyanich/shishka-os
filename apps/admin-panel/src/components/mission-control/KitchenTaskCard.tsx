import { useState } from 'react'
import { Check } from 'lucide-react'
import type { BusinessTask } from '../../hooks/useBusinessTasks'

// ── Category config ───────────────────────────────────────────────────────────

type Category = 'prep' | 'service' | 'cleaning' | 'order' | 'other'

interface CategoryConfig {
  label: string
  accent: string // left bar color class
  badge: string // badge bg+text classes
}

const CATEGORY_CONFIG: Record<Category, CategoryConfig> = {
  prep: { label: 'Prep', accent: 'bg-amber-watch', badge: 'bg-amber-watch/15 text-amber-watch' },
  service: {
    label: 'Service',
    accent: 'bg-[var(--color-royal-soft)]',
    badge: 'bg-forest-soft/15 text-mint-200',
  },
  cleaning: { label: 'Cleaning', accent: 'bg-honey-300', badge: 'bg-honey-300/15 text-honey-300' },
  order: { label: 'Orders', accent: 'bg-brick-soft', badge: 'bg-brick-soft/15 text-brick-bright' },
  other: { label: 'Other', accent: 'bg-[var(--s-3)]', badge: 'bg-[var(--s-3)] text-cream/80' },
}

function detectCategory(tags: string[]): Category {
  const lower = tags.map((t) => t.toLowerCase())
  if (lower.includes('prep')) return 'prep'
  if (lower.includes('service')) return 'service'
  if (lower.includes('cleaning')) return 'cleaning'
  if (lower.includes('order')) return 'order'
  return 'other'
}

// ── Time formatting ───────────────────────────────────────────────────────────

function formatTime(dueDate: string | null): string | null {
  if (!dueDate) return null
  const d = new Date(dueDate)
  if (isNaN(d.getTime())) return null
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

// ── Avatar helpers ────────────────────────────────────────────────────────────

function assigneeInitial(assignedTo: string | null): string {
  if (!assignedTo) return '?'
  return assignedTo[0].toUpperCase()
}

function assigneeBg(assignedTo: string | null): string {
  if (!assignedTo) return 'bg-[var(--s-3)] text-cream/60'
  const key = assignedTo.toLowerCase()
  if (key === 'lesia') return 'bg-forest-soft/20 text-mint-200'
  if (key === 'bas') return 'bg-honey-300/20 text-honey-300'
  return 'bg-[var(--s-3)] text-cream/80'
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface KitchenTaskCardProps {
  task: BusinessTask
  onClick?: (task: BusinessTask) => void
}

// ── Component ────────────────────────────────────────────────────────────────

export function KitchenTaskCard({ task, onClick }: KitchenTaskCardProps) {
  const [done, setDone] = useState(task.status === 'done')

  const category = detectCategory(task.tags)
  const config = CATEGORY_CONFIG[category]
  const timeStr = formatTime(task.due_date)
  const isRecurring = task.tags.map((t) => t.toLowerCase()).includes('recurring')
  const avatarColors = assigneeBg(task.assigned_to)

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
        'rounded-xl border border-[var(--line)] bg-[var(--s-1)]',
        'px-4 py-3 pl-5 overflow-hidden',
        'transition-all duration-150',
        'hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-fat/40',
        done ? 'opacity-50' : '',
      ].join(' ')}
    >
      {/* Left accent bar */}
      <span className={`absolute left-0 top-0 h-full w-[3px] ${config.accent} rounded-l-xl`} />

      {/* Row 1: title + time */}
      <div className="flex items-start justify-between gap-2">
        <p
          className={[
            'line-clamp-2 text-sm font-medium leading-snug flex-1',
            done ? 'line-through text-cream/45' : 'text-cream',
          ].join(' ')}
        >
          {task.title}
        </p>
        {timeStr && (
          <span className="shrink-0 rounded-full bg-[var(--s-2)] px-2 py-0.5 font-mono text-[10px] text-cream/60">
            {timeStr}
          </span>
        )}
      </div>

      {/* Row 2: category badge + recurring badge */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${config.badge}`}>
          {config.label}
        </span>
        {isRecurring && (
          <span className="rounded-full bg-[var(--s-3)] px-2 py-0.5 text-[10px] font-medium text-cream/60">
            Recurring
          </span>
        )}
      </div>

      {/* Bottom row: assignee + checkbox */}
      <div className="flex items-center gap-2 mt-auto pt-0.5">
        {/* Avatar */}
        <span
          className={[
            'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold shrink-0',
            avatarColors,
          ].join(' ')}
        >
          {assigneeInitial(task.assigned_to)}
        </span>
        <span className="flex-1 truncate text-[11px] text-cream/60">
          {task.assigned_to ?? 'Unassigned'}
        </span>

        {/* Checkbox */}
        <button
          type="button"
          aria-label={done ? 'Mark as not done' : 'Mark as done'}
          onClick={(e) => {
            e.stopPropagation()
            setDone((prev) => !prev)
          }}
          className={[
            'flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors duration-150',
            done
              ? 'border-forest-soft/50 bg-forest-soft/20 text-mint-200'
              : 'border-[var(--line-strong)] bg-transparent text-transparent hover:border-[var(--line-strong)]',
          ].join(' ')}
        >
          <Check className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}
