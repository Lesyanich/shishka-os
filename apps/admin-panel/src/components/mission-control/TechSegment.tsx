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
  const upper = tags.map((t) => t.toUpperCase())
  for (const size of SIZE_LABELS) {
    if (upper.includes(size)) return size
  }
  return 'M'
}

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

// ── Sub-components ───────────────────────────────────────────────────────────

function QuickWinCard({
  task,
  onClick,
}: {
  task: BusinessTask
  onClick: (t: BusinessTask) => void
}) {
  const size = detectSize(task.tags)
  const shortId = task.id.replace(/-/g, '').slice(0, 8)
  const domainColor = DOMAIN_COLORS[task.domain] ?? 'bg-[var(--s-3)] text-cream/80'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(task)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick(task)
      }}
      className={[
        'flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer select-none',
        'border border-[var(--line)] bg-[var(--s-1)]',
        'hover:border-[var(--line-strong)] hover:bg-[var(--s-2)]',
        'transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-car/50',
      ].join(' ')}
    >
      {/* Size badge */}
      <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold bg-[var(--s-3)] text-cream/60 w-7 text-center">
        {size}
      </span>

      {/* Title */}
      <span className="flex-1 truncate text-[12px] text-cream font-medium">{task.title}</span>

      {/* Right: id + domain */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="font-mono text-[10px] text-cream/45">#{shortId}</span>
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
  const domainColor = DOMAIN_COLORS[task.domain] ?? 'bg-[var(--s-3)] text-cream/80'
  const isCritical = task.priority === 'critical'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(task)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick(task)
      }}
      className={[
        'flex flex-col gap-1.5 px-4 py-3 rounded-xl cursor-pointer select-none',
        'border border-[var(--line)] bg-[var(--s-1)]',
        'hover:border-[var(--line-strong)] hover:bg-[var(--s-2)]',
        'transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-car/50',
      ].join(' ')}
    >
      {/* Row 1: Title + size badge */}
      <div className="flex items-start justify-between gap-2">
        <p className="flex-1 text-sm font-medium leading-snug text-cream">{task.title}</p>
        <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold bg-[var(--s-3)] text-cream/60">
          {size}
        </span>
      </div>

      {/* Row 2: short id */}
      <span className="font-mono text-[10px] text-cream/45">#{shortId}</span>

      {/* Row 3: description */}
      {task.description && (
        <p className="line-clamp-2 text-[11px] leading-snug text-cream/60">{task.description}</p>
      )}

      {/* Row 4: domain badge + critical badge */}
      <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${domainColor}`}>
          {task.domain}
        </span>
        {isCritical && (
          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-brick-soft/15 text-brick-bright border border-brick-soft/30">
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
  const [viewMode, setViewMode] = useState<ViewMode>('projects')

  // Only code/agent executor_type tasks
  const techTasks = tasks.filter((t) => t.executor_type === 'code' || t.executor_type === 'agent')

  // Apply filters
  const filtered = techTasks.filter((t) => {
    if (agentFilter !== 'all' && t.assigned_to?.toLowerCase() !== agentFilter) return false
    if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false
    if (search.trim() && !t.title.toLowerCase().includes(search.trim().toLowerCase())) return false
    return true
  })

  // Split by active vs backlog
  const activeTasks = filtered.filter((t) => t.status === 'in_progress' || t.status === 'blocked')
  const backlogTasks = filtered.filter((t) => t.status === 'inbox' || t.status === 'backlog')

  // Split backlog by size
  const quickWins = backlogTasks.filter((t) => {
    const s = detectSize(t.tags)
    return s === 'S' || s === 'M'
  })
  const epics = backlogTasks.filter((t) => {
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
    critical: 'text-brick-bright',
    high: 'text-amber-watch',
    medium: 'text-cream/80',
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
                    ? 'bg-nutri-car/10 text-cream/90 border border-nutri-car/40'
                    : 'bg-[var(--s-2)] text-cream/60 border border-[var(--line-strong)] hover:bg-[var(--s-3)] hover:text-cream/80',
                ].join(' ')}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* Divider */}
        <span className="h-5 w-px bg-[var(--s-3)]" />

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
                    ? 'bg-nutri-car/10 border border-nutri-car/40'
                    : 'bg-[var(--s-2)] border border-[var(--line-strong)] hover:bg-[var(--s-3)]',
                  isActive && textColor
                    ? textColor
                    : isActive
                      ? 'text-cream/90'
                      : (textColor ?? 'text-cream/60'),
                ].join(' ')}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--s-1)] px-2">
          <Layers className="h-3 w-3 text-cream/45" />
          <select
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as ViewMode)}
            className="bg-transparent py-1.5 pr-1 text-[11px] text-cream/80 focus:outline-none"
          >
            <option value="flat">Flat view</option>
            <option value="projects">By project</option>
          </select>
        </div>

        {/* Search */}
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-cream/45 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks..."
            className={[
              'rounded-lg bg-[var(--s-2)] border border-[var(--line-strong)] pl-8 pr-3 py-1.5',
              'text-xs text-cream placeholder:text-cream/45',
              'focus:outline-none focus:ring-2 focus:ring-nutri-car/40 focus:border-nutri-car/40',
              'w-48 transition-colors duration-150',
            ].join(' ')}
          />
        </div>
      </div>

      {/* ── Project view: unified grouped layout ── */}
      {viewMode === 'projects' ? (
        <ProjectGroupView
          tasks={filtered.filter((t) => t.status !== 'done' && t.status !== 'cancelled')}
          allTasks={tasks}
          onOpenDetail={onOpenDetail}
        />
      ) : (
        <>
          {/* Agent Queue zone */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Cpu className="h-4 w-4 text-nutri-car" />
              <h3 className="text-sm font-semibold text-cream">Agent Queue</h3>
              <span className="text-xs text-cream/45">Currently running &amp; blocked</span>
              {activeTasks.length > 0 && (
                <span className="ml-1 rounded-full bg-nutri-car/15 px-2 py-0.5 text-[10px] font-semibold text-cream/90">
                  {activeTasks.length}
                </span>
              )}
            </div>

            {activeTasks.length === 0 ? (
              <div className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--s-1)] px-4 py-5 text-xs text-cream/45">
                <Zap className="h-4 w-4 text-cream/30" />
                <span>No active agent tasks right now.</span>
              </div>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700">
                {activeTasks.map((task) => (
                  <FocusCard key={task.id} task={task} onClick={onOpenDetail} />
                ))}
              </div>
            )}
          </section>

          {/* Backlog zone */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Plus className="h-4 w-4 text-mint-200" />
              <h3 className="text-sm font-semibold text-cream">Backlog</h3>
              <span className="text-xs text-cream/45">Quick wins, tech debt &amp; epics</span>
              {backlogTasks.length > 0 && (
                <span className="ml-1 rounded-full bg-forest-soft/15 px-2 py-0.5 text-[10px] font-semibold text-mint-200">
                  {backlogTasks.length}
                </span>
              )}
            </div>

            {backlogTasks.length === 0 ? (
              <div className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--s-1)] px-4 py-5 text-xs text-cream/45">
                <Star className="h-4 w-4 text-cream/30" />
                <span>Backlog is clear.</span>
              </div>
            ) : (
              <div className="grid grid-cols-[1fr_1.6fr] gap-4">
                {/* Left: Quick Wins & Tech Debt */}
                <div className="flex flex-col gap-1">
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-cream/45">
                    Quick Wins &amp; Tech Debt
                  </p>
                  {quickWins.length === 0 ? (
                    <p className="text-xs text-cream/30 italic">None</p>
                  ) : (
                    quickWins.map((task) => (
                      <QuickWinCard key={task.id} task={task} onClick={onOpenDetail} />
                    ))
                  )}
                </div>

                {/* Right: Epics & Features */}
                <div className="flex flex-col gap-2">
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-cream/45">
                    Epics &amp; Features
                  </p>
                  {epics.length === 0 ? (
                    <p className="text-xs text-cream/30 italic">None</p>
                  ) : (
                    epics.map((task) => (
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
