import { useState } from 'react'
import { Search, Zap } from 'lucide-react'
import { FocusCard } from './FocusCard'
import type { BusinessTask } from '../../hooks/useBusinessTasks'

// ── Types ────────────────────────────────────────────────────────────────────

type PersonFilter = 'all' | 'lesia' | 'bas'

interface PersonPill {
  id: PersonFilter
  label: string
}

// ── Config ───────────────────────────────────────────────────────────────────

const PERSON_PILLS: PersonPill[] = [
  { id: 'all',   label: 'All' },
  { id: 'lesia', label: '👑 Lesia' },
  { id: 'bas',   label: '👤 Bas' },
]

// ── Props ────────────────────────────────────────────────────────────────────

export interface TeamSegmentProps {
  tasks: BusinessTask[]
  onOpenDetail: (task: BusinessTask) => void
}

// ── Component ────────────────────────────────────────────────────────────────

export function TeamSegment({ tasks, onOpenDetail }: TeamSegmentProps) {
  const [personFilter, setPersonFilter] = useState<PersonFilter>('all')
  const [search, setSearch] = useState('')

  const filtered = tasks.filter(task => {
    // Only human executor tasks in active states
    if (task.executor_type !== 'human') return false
    if (task.status !== 'in_progress' && task.status !== 'blocked') return false

    // Person filter
    if (personFilter !== 'all') {
      if (!task.assigned_to) return false
      if (task.assigned_to.toLowerCase() !== personFilter) return false
    }

    // Search filter
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      const inTitle = task.title.toLowerCase().includes(q)
      const inDesc  = task.description?.toLowerCase().includes(q) ?? false
      if (!inTitle && !inDesc) return false
    }

    return true
  })

  return (
    <section className="flex flex-col gap-4">
      {/* ── Controls bar ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap rounded-xl border border-slate-800/60 bg-slate-900/40 px-4 py-3">
        {/* "Show" label */}
        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 shrink-0">
          Show
        </span>

        {/* Person pills */}
        <div className="flex items-center gap-1.5">
          {PERSON_PILLS.map(pill => {
            const isActive = personFilter === pill.id
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => setPersonFilter(pill.id)}
                className={[
                  'rounded-full px-3 py-1 text-[11px] font-medium transition-colors duration-150',
                  'border',
                  isActive
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                    : 'border-slate-700/60 bg-transparent text-slate-400 hover:text-slate-300 hover:border-slate-600',
                ].join(' ')}
              >
                {pill.label}
              </button>
            )
          })}
        </div>

        {/* Search input — ml-auto pushes it to the right */}
        <div className="relative ml-auto flex items-center">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tasks…"
            className={[
              'rounded-lg border border-slate-700/60 bg-slate-800/60',
              'py-1.5 pl-3 pr-8 text-[12px] text-slate-300 placeholder-slate-600',
              'outline-none transition-colors duration-150',
              'focus:border-slate-600 focus:ring-1 focus:ring-slate-600',
              'w-44',
            ].join(' ')}
          />
          <Search className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-slate-500" />
        </div>
      </div>

      {/* ── Focus Now zone ────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        {/* Zone header */}
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-semibold text-slate-200">Focus Now</span>
          <span className="text-[11px] text-slate-500">Active work and blockers</span>
          {/* Count badge */}
          <span className="ml-1 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
            {filtered.length}
          </span>
        </div>

        {/* Cards row */}
        {filtered.length > 0 ? (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {filtered.map(task => (
              <FocusCard key={task.id} task={task} onClick={onOpenDetail} />
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-800/60 bg-slate-900/20 px-6 py-8">
            <p className="text-[12px] text-slate-600">
              No active tasks
              {personFilter !== 'all' ? ` for ${personFilter}` : ''}
              {search.trim() ? ` matching "${search.trim()}"` : ''}
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
