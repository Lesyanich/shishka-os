import { useState } from 'react'
import { Check } from 'lucide-react'
import type { BusinessTask } from '../../hooks/useBusinessTasks'

// ── Category config ───────────────────────────────────────────────────────────

type Category = 'prep' | 'service' | 'cleaning' | 'order' | 'other'

interface CategoryConfig {
  label: string
  accent: string        // left bar color class
  badge: string         // badge bg+text classes
}

const CATEGORY_CONFIG: Record<Category, CategoryConfig> = {
  prep:     { label: 'Prep',     accent: 'bg-orange-500',  badge: 'bg-orange-500/15 text-orange-300' },
  service:  { label: 'Service',  accent: 'bg-emerald-500', badge: 'bg-emerald-500/15 text-emerald-300' },
  cleaning: { label: 'Cleaning', accent: 'bg-blue-500',    badge: 'bg-blue-500/15 text-blue-300' },
  order:    { label: 'Orders',   accent: 'bg-violet-500',  badge: 'bg-violet-500/15 text-violet-300' },
  other:    { label: 'Other',    accent: 'bg-slate-500',   badge: 'bg-slate-500/15 text-slate-300' },
}

function detectCategory(tags: string[]): Category {
  const lower = tags.map(t => t.toLowerCase())
  if (lower.includes('prep'))     return 'prep'
  if (lower.includes('service'))  return 'service'
  if (lower.includes('cleaning')) return 'cleaning'
  if (lower.includes('order'))    return 'order'
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
  if (!assignedTo) return 'bg-slate-700 text-slate-400'
  const key = assignedTo.toLowerCase()
  if (key === 'lesia') return 'bg-emerald-500/20 text-emerald-300'
  if (key === 'bas')   return 'bg-cyan-500/20 text-cyan-300'
  return 'bg-slate-600/40 text-slate-300'
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
  const isRecurring = task.tags.map(t => t.toLowerCase()).includes('recurring')
  const avatarColors = assigneeBg(task.assigned_to)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick?.(task)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onClick?.(task) }}
      className={[
        'relative flex flex-col gap-2 cursor-pointer select-none',
        'rounded-xl border border-slate-800/50 bg-slate-900/60',
        'px-4 py-3 pl-5 overflow-hidden',
        'transition-all duration-150',
        'hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40',
        done ? 'opacity-50' : '',
      ].join(' ')}
    >
      {/* Left accent bar */}
      <span className={`absolute left-0 top-0 h-full w-[3px] ${config.accent} rounded-l-xl`} />

      {/* Row 1: title + time */}
      <div className="flex items-start justify-between gap-2">
        <p className={[
          'line-clamp-2 text-sm font-medium leading-snug flex-1',
          done ? 'line-through text-slate-500' : 'text-slate-100',
        ].join(' ')}>
          {task.title}
        </p>
        {timeStr && (
          <span className="shrink-0 rounded-full bg-slate-800/80 px-2 py-0.5 font-mono text-[10px] text-slate-400">
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
          <span className="rounded-full bg-slate-700/60 px-2 py-0.5 text-[10px] font-medium text-slate-400">
            Recurring
          </span>
        )}
      </div>

      {/* Bottom row: assignee + checkbox */}
      <div className="flex items-center gap-2 mt-auto pt-0.5">
        {/* Avatar */}
        <span className={[
          'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold shrink-0',
          avatarColors,
        ].join(' ')}>
          {assigneeInitial(task.assigned_to)}
        </span>
        <span className="flex-1 truncate text-[11px] text-slate-400">
          {task.assigned_to ?? 'Unassigned'}
        </span>

        {/* Checkbox */}
        <button
          type="button"
          aria-label={done ? 'Mark as not done' : 'Mark as done'}
          onClick={e => {
            e.stopPropagation()
            setDone(prev => !prev)
          }}
          className={[
            'flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors duration-150',
            done
              ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-400'
              : 'border-slate-700/60 bg-transparent text-transparent hover:border-slate-500',
          ].join(' ')}
        >
          <Check className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}
