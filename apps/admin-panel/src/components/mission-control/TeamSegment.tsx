import { useState } from 'react'
import { Search, Zap, List, Layers } from 'lucide-react'
import { FocusCard } from './FocusCard'
import { GroupedTaskList } from './GroupedTaskList'
import { ProjectGroupView } from './ProjectGroupView'
import type { BusinessTask, TaskDomain } from '../../hooks/useBusinessTasks'
import type { GroupBy } from '../../utils/taskGrouping'

// ── Types ────────────────────────────────────────────────────────────────────

type PersonFilter = 'all' | 'lesia' | 'bas'
type DomainFilter = 'all' | TaskDomain

interface PersonPill {
  id: PersonFilter
  label: string
}

interface DomainPill {
  id: DomainFilter
  label: string
}

// ── Config ───────────────────────────────────────────────────────────────────

const PERSON_PILLS: PersonPill[] = [
  { id: 'all',   label: 'All' },
  { id: 'lesia', label: '👑 Lesia' },
  { id: 'bas',   label: '👤 Bas' },
]

const DOMAIN_PILLS: DomainPill[] = [
  { id: 'all',         label: 'All' },
  { id: 'kitchen',     label: '🍳 Kitchen' },
  { id: 'finance',     label: '💰 Finance' },
  { id: 'procurement', label: '📦 Procurement' },
  { id: 'ops',         label: '⚙️ Ops' },
  { id: 'tech',        label: '💻 Tech' },
  { id: 'marketing',   label: '📢 Marketing' },
  { id: 'sales',       label: '💎 Sales' },
  { id: 'strategy',    label: '🧭 Strategy' },
]

// ── Props ────────────────────────────────────────────────────────────────────

export interface TeamSegmentProps {
  tasks: BusinessTask[]
  onOpenDetail: (task: BusinessTask) => void
}

// ── TaskRow ──────────────────────────────────────────────────────────────────

function TaskRow({ task, onClick }: { task: BusinessTask; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="group flex cursor-pointer items-center gap-3 rounded-lg border border-slate-800/30 bg-slate-900/40 px-3 py-2 hover:border-slate-700/50 hover:bg-slate-800/40 transition"
    >
      {/* Priority dot */}
      <span className={`h-2 w-2 rounded-full shrink-0 ${
        task.priority === 'critical' ? 'bg-red-400' :
        task.priority === 'high' ? 'bg-orange-400' :
        task.priority === 'medium' ? 'bg-blue-400' : 'bg-slate-500'
      }`} />
      {/* Title */}
      <span className="text-xs font-medium text-slate-100 truncate flex-1">{task.title}</span>
      {/* Domain badge */}
      <span className="rounded-full bg-slate-800/60 px-2 py-0.5 text-[9px] text-slate-400">{task.domain}</span>
      {/* Status */}
      <span className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${
        task.status === 'in_progress' ? 'bg-amber-500/10 text-amber-400' :
        task.status === 'blocked' ? 'bg-red-500/10 text-red-400' :
        task.status === 'inbox' ? 'bg-slate-500/10 text-slate-400' :
        'bg-blue-500/10 text-blue-400'
      }`}>{task.status.replace('_', ' ')}</span>
      {/* Assignee */}
      {task.assigned_to && (
        <span className="text-[9px] text-slate-500">{task.assigned_to}</span>
      )}
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

export function TeamSegment({ tasks, onOpenDetail }: TeamSegmentProps) {
  const [personFilter, setPersonFilter] = useState<PersonFilter>('all')
  const [domainFilter, setDomainFilter] = useState<DomainFilter>('all')
  const [search, setSearch] = useState('')
  const [groupBy, setGroupBy] = useState<GroupBy>('project')

  const person = personFilter !== 'all' ? personFilter : null

  // Shared filter for person + domain + search
  function matchesFilters(task: BusinessTask): boolean {
    if (task.executor_type !== 'human') return false
    if (domainFilter !== 'all' && task.domain !== domainFilter) return false
    if (person && task.assigned_to?.toLowerCase() !== person) return false
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      if (!task.title.toLowerCase().includes(q) && !task.description?.toLowerCase().includes(q)) return false
    }
    return true
  }

  // Focus Now: only in_progress + blocked
  const filtered = tasks.filter(task => {
    if (!matchesFilters(task)) return false
    return task.status === 'in_progress' || task.status === 'blocked'
  })

  // All Tasks: everything except done/cancelled
  const allHumanTasks = tasks.filter(task => {
    if (!matchesFilters(task)) return false
    return task.status !== 'done' && task.status !== 'cancelled'
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

        {/* Domain divider + pills */}
        <div className="h-5 w-px bg-slate-700/40" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 shrink-0">
          Domain
        </span>
        <div className="flex items-center gap-1 overflow-x-auto">
          {DOMAIN_PILLS.map(pill => {
            const isActive = domainFilter === pill.id
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => setDomainFilter(pill.id)}
                className={[
                  'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors duration-150 whitespace-nowrap',
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

        {/* GroupBy dropdown */}
        <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/60 px-2">
          <Layers className="h-3 w-3 text-slate-500" />
          <select
            value={groupBy}
            onChange={e => setGroupBy(e.target.value as GroupBy)}
            className="bg-transparent py-1.5 pr-1 text-[11px] text-slate-300 focus:outline-none"
          >
            <option value="none">No grouping</option>
            <option value="project">Group by project</option>
            <option value="topic">Group by topic</option>
            <option value="agent">Group by agent</option>
          </select>
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

      {/* ── All Tasks zone ────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        {/* Zone header */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-500/10 text-slate-400">
            <List className="h-3.5 w-3.5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-100">All Tasks</div>
            <div className="text-[11px] text-slate-500">Inbox, backlog, in progress, blocked</div>
          </div>
          <span className="ml-2 rounded-md bg-slate-800/60 px-2 py-0.5 font-mono text-[10px] text-slate-400">
            {allHumanTasks.length}
          </span>
        </div>

        {/* Task list */}
        {allHumanTasks.length > 0 ? (
          groupBy === 'project' ? (
            <ProjectGroupView tasks={allHumanTasks} allTasks={tasks} onOpenDetail={onOpenDetail} />
          ) : (
            <GroupedTaskList
              tasks={allHumanTasks}
              groupBy={groupBy}
              renderItem={(task) => <TaskRow key={task.id} task={task} onClick={() => onOpenDetail(task)} />}
            />
          )
        ) : (
          <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-800/60 bg-slate-900/20 px-6 py-8">
            <p className="text-[12px] text-slate-600">
              No tasks
              {personFilter !== 'all' ? ` for ${personFilter}` : ''}
              {search.trim() ? ` matching "${search.trim()}"` : ''}
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
