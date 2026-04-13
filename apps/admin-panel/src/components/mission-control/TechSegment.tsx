import { useState } from 'react'
import { Cpu, Plus, Search, Zap, Star, Layers } from 'lucide-react'
import type { BusinessTask, TaskPriority } from '../../hooks/useBusinessTasks'
import { FocusCard } from './FocusCard'
import { ProjectGroupView } from './ProjectGroupView'

// ── Types ────────────────────────────────────────────────────────────────────

export interface TechSegmentProps {
  tasks: BusinessTask[]
  onOpenDetail: (task: BusinessTask) => void
}

type AgentFilter = 'all' | 'code' | 'chef' | 'finance'
type PriorityFilter = 'all' | TaskPriority

// ── Helpers ──────────────────────────────────────────────────────────────────

const SIZE_LABELS = ['XL', 'L', 'M', 'S'] as const
type TaskSize = (typeof SIZE_LABELS)[number]

function detectSize(tags: string[]): TaskSize {
  const upper = tags.map(t => t.toUpperCase())
  for (const size of SIZE_LABELS) {
    if (upper.includes(size)) return size
  }
  return 'M'
}

const DOMAIN_COLORS: Record<string, string> = {
  kitchen:     'bg-orange-500/20 text-orange-300',
  procurement: 'bg-yellow-500/20 text-yellow-300',
  finance:     'bg-emerald-500/20 text-emerald-300',
  marketing:   'bg-pink-500/20 text-pink-300',
  ops:         'bg-sky-500/20 text-sky-300',
  sales:       'bg-violet-500/20 text-violet-300',
  strategy:    'bg-indigo-500/20 text-indigo-300',
  tech:        'bg-cyan-500/20 text-cyan-300',
}

// ── Sub-components ───────────────────────────────────────────────────────────

function QuickWinCard({ task, onClick }: { task: BusinessTask; onClick: (t: BusinessTask) => void }) {
  const size = detectSize(task.tags)
  const shortId = task.id.replace(/-/g, '').slice(0, 8)
  const domainColor = DOMAIN_COLORS[task.domain] ?? 'bg-slate-500/20 text-slate-300'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(task)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onClick(task) }}
      className={[
        'flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer select-none',
        'border border-slate-800/40 bg-slate-900/40',
        'hover:border-slate-700/50 hover:bg-slate-800/40',
        'transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50',
      ].join(' ')}
    >
      {/* Size badge */}
      <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold bg-slate-700/60 text-slate-400 w-7 text-center">
        {size}
      </span>

      {/* Title */}
      <span className="flex-1 truncate text-[12px] text-slate-200 font-medium">
        {task.title}
      </span>

      {/* Right: id + domain */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="font-mono text-[10px] text-slate-500">#{shortId}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${domainColor}`}>
          {task.domain}
        </span>
      </div>
    </div>
  )
}

function EpicCard({ task, onClick }: { task: BusinessTask; onClick: (t: BusinessTask) => void }) {
  const size = detectSize(task.tags)
  const shortId = task.id.replace(/-/g, '').slice(0, 8)
  const domainColor = DOMAIN_COLORS[task.domain] ?? 'bg-slate-500/20 text-slate-300'
  const isCritical = task.priority === 'critical'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(task)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onClick(task) }}
      className={[
        'flex flex-col gap-1.5 px-4 py-3 rounded-xl cursor-pointer select-none',
        'border border-slate-800/50 bg-slate-900/50',
        'hover:border-slate-700/50 hover:bg-slate-800/40',
        'transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50',
      ].join(' ')}
    >
      {/* Row 1: Title + size badge */}
      <div className="flex items-start justify-between gap-2">
        <p className="flex-1 text-sm font-medium leading-snug text-slate-100">
          {task.title}
        </p>
        <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold bg-slate-700/60 text-slate-400">
          {size}
        </span>
      </div>

      {/* Row 2: short id */}
      <span className="font-mono text-[10px] text-slate-500">#{shortId}</span>

      {/* Row 3: description */}
      {task.description && (
        <p className="line-clamp-2 text-[11px] leading-snug text-slate-400">
          {task.description}
        </p>
      )}

      {/* Row 4: domain badge + critical badge */}
      <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${domainColor}`}>
          {task.domain}
        </span>
        {isCritical && (
          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-red-500/15 text-red-400 border border-red-500/30">
            critical
          </span>
        )}
      </div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

type ViewMode = 'flat' | 'projects'

export function TechSegment({ tasks, onOpenDetail }: TechSegmentProps) {
  const [agentFilter, setAgentFilter] = useState<AgentFilter>('all')
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all')
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('flat')

  // Only code/agent executor_type tasks
  const techTasks = tasks.filter(t => t.executor_type === 'code' || t.executor_type === 'agent')

  // Apply filters
  const filtered = techTasks.filter(t => {
    if (agentFilter !== 'all' && t.assigned_to?.toLowerCase() !== agentFilter) return false
    if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false
    if (search.trim() && !t.title.toLowerCase().includes(search.trim().toLowerCase())) return false
    return true
  })

  // Split by active vs backlog
  const activeTasks = filtered.filter(t => t.status === 'in_progress' || t.status === 'blocked')
  const backlogTasks = filtered.filter(t => t.status === 'inbox' || t.status === 'backlog')

  // Split backlog by size
  const quickWins = backlogTasks.filter(t => {
    const s = detectSize(t.tags)
    return s === 'S' || s === 'M'
  })
  const epics = backlogTasks.filter(t => {
    const s = detectSize(t.tags)
    return s === 'L' || s === 'XL'
  })

  const agentPills: { key: AgentFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'code', label: 'Code' },
    { key: 'chef', label: 'Chef' },
    { key: 'finance', label: 'Finance' },
  ]

  const priorityPills: { key: PriorityFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'critical', label: 'Critical' },
    { key: 'high', label: 'High' },
    { key: 'medium', label: 'Medium' },
  ]

  const priorityColor: Record<string, string> = {
    critical: 'text-red-400',
    high:     'text-orange-400',
    medium:   'text-slate-300',
  }

  return (
    <div className="flex flex-col gap-6">

      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-3">

        {/* Agent filter */}
        <div className="flex items-center gap-1.5">
          {agentPills.map(({ key, label }) => {
            const isActive = agentFilter === key
            return (
              <button
                key={key}
                onClick={() => setAgentFilter(key)}
                className={[
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150',
                  isActive
                    ? 'bg-violet-500/10 text-violet-400 border border-violet-500/30'
                    : 'bg-slate-800/60 text-slate-400 border border-slate-700/40 hover:border-slate-600/60 hover:text-slate-300',
                ].join(' ')}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* Divider */}
        <span className="h-5 w-px bg-slate-700/60" />

        {/* Priority filter */}
        <div className="flex items-center gap-1.5">
          {priorityPills.map(({ key, label }) => {
            const isActive = priorityFilter === key
            const textColor = key !== 'all' ? priorityColor[key] : undefined
            return (
              <button
                key={key}
                onClick={() => setPriorityFilter(key)}
                className={[
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150',
                  isActive
                    ? 'bg-violet-500/10 border border-violet-500/30'
                    : 'bg-slate-800/60 border border-slate-700/40 hover:border-slate-600/60',
                  isActive && textColor ? textColor : isActive ? 'text-violet-400' : (textColor ?? 'text-slate-400'),
                ].join(' ')}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/60 px-2">
          <Layers className="h-3 w-3 text-slate-500" />
          <select
            value={viewMode}
            onChange={e => setViewMode(e.target.value as ViewMode)}
            className="bg-transparent py-1.5 pr-1 text-[11px] text-slate-300 focus:outline-none"
          >
            <option value="flat">Flat view</option>
            <option value="projects">By project</option>
          </select>
        </div>

        {/* Search */}
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tasks..."
            className={[
              'rounded-lg bg-slate-800/60 border border-slate-700/40 pl-8 pr-3 py-1.5',
              'text-xs text-slate-200 placeholder:text-slate-500',
              'focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/40',
              'w-48 transition-colors duration-150',
            ].join(' ')}
          />
        </div>
      </div>

      {/* ── Project view: unified grouped layout ── */}
      {viewMode === 'projects' ? (
        <ProjectGroupView
          tasks={filtered.filter(t => t.status !== 'done' && t.status !== 'cancelled')}
          allTasks={tasks}
          onOpenDetail={onOpenDetail}
        />
      ) : (
        <>
        {/* Agent Queue zone */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Cpu className="h-4 w-4 text-violet-400" />
            <h3 className="text-sm font-semibold text-slate-200">Agent Queue</h3>
            <span className="text-xs text-slate-500">Currently running &amp; blocked</span>
            {activeTasks.length > 0 && (
              <span className="ml-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-400">
                {activeTasks.length}
              </span>
            )}
          </div>

          {activeTasks.length === 0 ? (
            <div className="flex items-center gap-2 rounded-xl border border-slate-800/40 bg-slate-900/30 px-4 py-5 text-xs text-slate-500">
              <Zap className="h-4 w-4 text-slate-600" />
              <span>No active agent tasks right now.</span>
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700">
              {activeTasks.map(task => (
                <FocusCard key={task.id} task={task} onClick={onOpenDetail} />
              ))}
            </div>
          )}
        </section>

        {/* Backlog zone */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Plus className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-200">Backlog</h3>
            <span className="text-xs text-slate-500">Quick wins, tech debt &amp; epics</span>
            {backlogTasks.length > 0 && (
              <span className="ml-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                {backlogTasks.length}
              </span>
            )}
          </div>

          {backlogTasks.length === 0 ? (
            <div className="flex items-center gap-2 rounded-xl border border-slate-800/40 bg-slate-900/30 px-4 py-5 text-xs text-slate-500">
              <Star className="h-4 w-4 text-slate-600" />
              <span>Backlog is clear.</span>
            </div>
          ) : (
          <div className="grid grid-cols-[1fr_1.6fr] gap-4">
            {/* Left: Quick Wins & Tech Debt */}
            <div className="flex flex-col gap-1">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Quick Wins &amp; Tech Debt
              </p>
              {quickWins.length === 0 ? (
                <p className="text-xs text-slate-600 italic">None</p>
              ) : (
                quickWins.map(task => (
                  <QuickWinCard key={task.id} task={task} onClick={onOpenDetail} />
                ))
              )}
            </div>

            {/* Right: Epics & Features */}
            <div className="flex flex-col gap-2">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Epics &amp; Features
              </p>
              {epics.length === 0 ? (
                <p className="text-xs text-slate-600 italic">None</p>
              ) : (
                epics.map(task => (
                  <EpicCard key={task.id} task={task} onClick={onOpenDetail} />
                ))
              )}
            </div>
          </div>
        )}
        </section>
        </>
      )}
    </div>
  )
}
