import { useState, useMemo } from 'react'
import { Rocket, Plus, Loader2, X, Search, ArrowUpDown } from 'lucide-react'
import { useBusinessTasks } from '../hooks/useBusinessTasks'
import type { BusinessTask, TaskStatus, TaskPriority, NewBusinessTask } from '../hooks/useBusinessTasks'
import { useDataHealth } from '../hooks/useDataHealth'
import { useAppRole } from '../contexts/AppRoleContext'
import { SegmentBar } from '../components/mission-control/SegmentBar'
import type { Segment } from '../components/mission-control/SegmentBar'
import { TeamSegment } from '../components/mission-control/TeamSegment'
import { TechSegment } from '../components/mission-control/TechSegment'
import { KitchenSegment } from '../components/mission-control/KitchenSegment'
import { QuickAddForm } from '../components/mission-control/QuickAddForm'
import { KanbanBoard } from '../components/mission-control/KanbanBoard'
import { TaskDetailPanel } from '../components/mission-control/TaskDetailPanel'
import { DataHealthTab } from '../components/mission-control/DataHealthTab'

// ── Constants ──

type TopTab = 'planning' | 'kanban' | 'data-health'
type SortField = 'priority' | 'updated' | 'created'

const PRIORITY_ORDER: Record<TaskPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 }

// ── Main Page ──

export function MissionControl() {
  const { role } = useAppRole()
  const isCEO = role === 'owner'

  const [activeTab, setActiveTab] = useState<TopTab>('planning')
  const [segment, setSegment] = useState<Segment>('team')
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [selectedTask, setSelectedTask] = useState<BusinessTask | null>(null)

  // Kanban-specific state
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<SortField>('priority')
  const [showDone] = useState(false)
  const [activeStatus] = useState<TaskStatus | null>(null)

  const { tasks: allTasks, isLoading, error, refetch, addTask, updateTask } = useBusinessTasks('all')

  // ── Handlers ──

  const handleAddTask = async (task: NewBusinessTask) => {
    const ok = await addTask(task)
    if (ok) setShowQuickAdd(false)
  }

  const handleMoveTask = async (id: string, newStatus: TaskStatus) => {
    await updateTask(id, { status: newStatus })
  }

  const handleUpdateTask = async (id: string, updates: Partial<BusinessTask>): Promise<boolean> => {
    const ok = await updateTask(id, updates)
    if (ok) setSelectedTask(null)
    return ok
  }

  const handleOpenDetail = (task: BusinessTask) => setSelectedTask(task)

  // ── Derived data ──

  const activeTasks = useMemo(
    () => allTasks.filter(t => t.status !== 'done' && t.status !== 'cancelled'),
    [allTasks],
  )

  const segmentCounts = useMemo<Record<Segment, number>>(() => ({
    team: activeTasks.filter(t => t.executor_type === 'human').length,
    tech: activeTasks.filter(t => t.executor_type === 'code' || t.executor_type === 'agent').length,
    kitchen: activeTasks.filter(t => t.domain === 'kitchen' && t.executor_type === 'human').length,
  }), [activeTasks])

  // Data Health tab — live count of errors+warnings+actions (info metrics don't badge)
  const { metrics: healthMetrics } = useDataHealth()
  const dataHealthCount = useMemo(
    () =>
      healthMetrics
        .filter(m => m.severity === 'error' || m.severity === 'warning' || m.severity === 'action')
        .reduce((sum, m) => sum + m.val, 0),
    [healthMetrics],
  )

  const searchLower = searchQuery.toLowerCase()
  const kanbanTasks = useMemo(() => {
    const filtered = allTasks.filter(t => {
      if (!showDone && (t.status === 'done' || t.status === 'cancelled')) return false
      if (activeStatus && t.status !== activeStatus) return false
      if (searchLower) {
        const inTitle = t.title.toLowerCase().includes(searchLower)
        const inDesc = t.description?.toLowerCase().includes(searchLower)
        const inTags = t.tags?.some(tag => tag.toLowerCase().includes(searchLower))
        if (!inTitle && !inDesc && !inTags) return false
      }
      return true
    })
    filtered.sort((a, b) => {
      if (sortField === 'priority') return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
      if (sortField === 'created') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })
    return filtered
  }, [allTasks, showDone, activeStatus, searchLower, sortField])

  // Force non-CEO to team segment
  const effectiveSegment = isCEO ? segment : 'team'

  // ── Tab definitions ──

  const tabs: { id: TopTab; label: string; badge?: React.ReactNode }[] = [
    {
      id: 'planning',
      label: 'Planning',
      badge: activeTasks.length > 0 ? (
        <span className="ml-1.5 rounded-full bg-slate-700 px-1.5 text-[10px] text-slate-300">
          {activeTasks.length}
        </span>
      ) : null,
    },
    { id: 'kanban', label: 'Kanban' },
    {
      id: 'data-health',
      label: 'Data Health',
      badge: dataHealthCount > 0 ? (
        <span className="ml-1.5 rounded-full bg-red-500/20 px-1.5 text-[10px] font-semibold text-red-400">
          {dataHealthCount}
        </span>
      ) : null,
    },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <Rocket className="h-5 w-5 text-emerald-400" />
            Mission Control
          </h1>
          <p className="text-sm text-slate-500">Cross-domain task tracker</p>
        </div>
        <button
          onClick={() => setShowQuickAdd(!showQuickAdd)}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-500 transition"
        >
          <Plus className="h-3.5 w-3.5" />
          Quick Add
        </button>
      </div>

      {/* Quick Add Form */}
      {showQuickAdd && (
        <QuickAddForm
          onSubmit={handleAddTask}
          onCancel={() => setShowQuickAdd(false)}
          activeDomain="all"
        />
      )}

      {/* Role banner (non-CEO) */}
      {!isCEO && (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2.5 text-sm text-blue-300">
          Viewing as <strong className="font-semibold">Cook</strong> — showing only your tasks
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-0 border-b-2 border-slate-800">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={[
              'relative flex items-center px-4 py-2.5 text-sm font-medium transition',
              activeTab === tab.id
                ? 'text-emerald-300'
                : 'text-slate-500 hover:text-slate-300',
            ].join(' ')}
          >
            {tab.label}
            {tab.badge}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-400 -mb-[2px]" />
            )}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 text-sm text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-emerald-500" />
          Loading tasks...
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
          <button onClick={refetch} className="ml-2 underline hover:text-red-200">Retry</button>
        </div>
      )}

      {/* ── Planning tab ── */}
      {!isLoading && activeTab === 'planning' && (
        <div className="space-y-4">
          {isCEO && (
            <SegmentBar active={effectiveSegment} onChange={setSegment} counts={segmentCounts} />
          )}

          {effectiveSegment === 'team' && (
            <TeamSegment tasks={allTasks} onOpenDetail={handleOpenDetail} />
          )}
          {effectiveSegment === 'tech' && (
            <TechSegment tasks={allTasks} onOpenDetail={handleOpenDetail} />
          )}
          {effectiveSegment === 'kitchen' && (
            <KitchenSegment tasks={allTasks} onOpenDetail={handleOpenDetail} />
          )}
        </div>
      )}

      {/* ── Kanban tab ── */}
      {!isLoading && activeTab === 'kanban' && (
        <div className="space-y-4">
          {/* Search + Sort row */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search tasks by title, description, or tag..."
                className="w-full rounded-lg border border-slate-800 bg-slate-900/60 pl-9 pr-8 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/60 px-2">
              <ArrowUpDown className="h-3.5 w-3.5 text-slate-500" />
              <select
                value={sortField}
                onChange={e => setSortField(e.target.value as SortField)}
                className="bg-transparent py-2 pr-1 text-xs text-slate-300 focus:outline-none"
              >
                <option value="priority">Priority</option>
                <option value="updated">Last updated</option>
                <option value="created">Newest first</option>
              </select>
            </div>
          </div>

          <KanbanBoard
            tasks={kanbanTasks}
            isLoading={isLoading}
            onMoveTask={handleMoveTask}
            onOpenDetail={handleOpenDetail}
            showDone={showDone}
            activeStatus={activeStatus}
          />
        </div>
      )}

      {/* ── Data Health tab ── */}
      {activeTab === 'data-health' && <DataHealthTab addTask={addTask} />}

      {/* Task Detail Panel */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={handleUpdateTask}
        />
      )}
    </div>
  )
}
