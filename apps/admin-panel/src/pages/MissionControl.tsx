import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Rocket, Plus, Loader2, X, Search, ArrowUpDown } from 'lucide-react'
import { useBusinessTasks } from '../hooks/useBusinessTasks'
import type {
  BusinessTask,
  TaskStatus,
  TaskPriority,
  NewBusinessTask,
} from '../hooks/useBusinessTasks'
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
import { useTabParam } from '../hooks/useTabParam'

// ── Constants ──

type TopTab = 'planning' | 'kanban' | 'data-health'
type SortField = 'priority' | 'updated' | 'created'

const PRIORITY_ORDER: Record<TaskPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 }

// ── Main Page ──

export function MissionControl() {
  const { role } = useAppRole()
  const isCEO = role === 'owner'
  const [searchParams, setSearchParams] = useSearchParams()

  const [activeTab, setActiveTab] = useTabParam(
    ['planning', 'kanban', 'data-health'] as const,
    'planning',
  )
  const [segment, setSegment] = useState<Segment>('team')
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [selectedTask, setSelectedTask] = useState<BusinessTask | null>(null)

  // Kanban-specific state
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<SortField>('priority')
  const [showDone] = useState(false)
  const [activeStatus] = useState<TaskStatus | null>(null)

  const {
    tasks: allTasks,
    isLoading,
    error,
    refetch,
    addTask,
    updateTask,
  } = useBusinessTasks('all')

  // ── Deep-link: open task from ?taskId= param ──
  useEffect(() => {
    const taskId = searchParams.get('taskId')
    if (!taskId || allTasks.length === 0) return
    const found = allTasks.find((t) => t.id === taskId)
    if (found && found.id !== selectedTask?.id) {
      setSelectedTask(found)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedTask?.id intentionally excluded to prevent loop
  }, [searchParams, allTasks])

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
    if (ok) {
      setSelectedTask(null)
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          p.delete('taskId')
          return p
        },
        { replace: true },
      )
    }
    return ok
  }

  const handleOpenDetail = (task: BusinessTask) => {
    setSelectedTask(task)
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        p.set('taskId', task.id)
        return p
      },
      { replace: true },
    )
  }

  // ── Derived data ──

  const activeTasks = useMemo(
    () => allTasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled'),
    [allTasks],
  )

  const segmentCounts = useMemo<Record<Segment, number>>(
    () => ({
      team: activeTasks.filter((t) => t.executor_type === 'human').length,
      tech: activeTasks.filter((t) => t.executor_type === 'code' || t.executor_type === 'agent')
        .length,
      kitchen: activeTasks.filter((t) => t.domain === 'kitchen' && t.executor_type === 'human')
        .length,
    }),
    [activeTasks],
  )

  // Data Health tab — live count of errors+warnings+actions (info metrics don't badge)
  const { metrics: healthMetrics } = useDataHealth()
  const dataHealthCount = useMemo(
    () =>
      healthMetrics
        .filter(
          (m) => m.severity === 'error' || m.severity === 'warning' || m.severity === 'action',
        )
        .reduce((sum, m) => sum + m.val, 0),
    [healthMetrics],
  )

  const searchLower = searchQuery.toLowerCase()
  const kanbanTasks = useMemo(() => {
    const filtered = allTasks.filter((t) => {
      if (!showDone && (t.status === 'done' || t.status === 'cancelled')) return false
      if (activeStatus && t.status !== activeStatus) return false
      if (searchLower) {
        const inTitle = t.title.toLowerCase().includes(searchLower)
        const inDesc = t.description?.toLowerCase().includes(searchLower)
        const inTags = t.tags?.some((tag) => tag.toLowerCase().includes(searchLower))
        if (!inTitle && !inDesc && !inTags) return false
      }
      return true
    })
    filtered.sort((a, b) => {
      if (sortField === 'priority') return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
      if (sortField === 'created')
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
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
      badge:
        activeTasks.length > 0 ? (
          <span className="ml-1.5 rounded-full bg-[var(--s-3)] px-1.5 text-[10px] text-cream/80">
            {activeTasks.length}
          </span>
        ) : null,
    },
    { id: 'kanban', label: 'Kanban' },
    {
      id: 'data-health',
      label: 'Data Health',
      badge:
        dataHealthCount > 0 ? (
          <span className="ml-1.5 rounded-full bg-brick-soft/20 px-1.5 text-[10px] font-semibold text-brick-bright">
            {dataHealthCount}
          </span>
        ) : null,
    },
  ]

  return (
    <div className="menu-canvas -mx-4 space-y-5 px-4 pt-5 pb-10 sm:-mx-6 sm:px-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <span className="shk-seal" aria-hidden>
            <Rocket className="h-4 w-4" />
          </span>
          <div>
            <div className="shk-eyebrow">Mission control &middot; tasks</div>
            <h1 className="mt-1 font-display text-4xl font-bold leading-none tracking-tight text-cream">
              Mission Control
            </h1>
            <p className="mt-1.5 text-sm text-cream/45">Cross-domain task tracker</p>
          </div>
        </div>
        <button
          onClick={() => setShowQuickAdd(!showQuickAdd)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-royal-red)] px-4 py-2 text-xs font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] transition hover:brightness-110"
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
        <div className="rounded-lg border border-honey-300/30 bg-honey-300/10 px-4 py-2.5 text-sm text-honey-300">
          Viewing as <strong className="font-semibold">Cook</strong> — showing only your tasks
        </div>
      )}

      {/* Tab bar */}
      <div className="shk-seg" role="group" aria-label="Mission Control view">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="shk-seg-btn"
            aria-pressed={activeTab === tab.id}
          >
            {tab.label}
            {tab.badge}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 text-sm text-cream/45">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-mint-200" />
          Loading tasks...
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-brick-soft/30 bg-brick-soft/10 px-4 py-3 text-sm text-brick-bright">
          {error}
          <button onClick={refetch} className="ml-2 underline hover:text-brick-bright">
            Retry
          </button>
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
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-cream/45" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tasks by title, description, or tag..."
                className="w-full rounded-lg border border-[var(--line)] bg-[var(--s-1)] pl-9 pr-8 py-2 text-sm text-cream placeholder:text-cream/30 focus:border-forest-soft/50 focus:outline-none focus:ring-1 focus:ring-forest-soft/30"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-cream/45 hover:text-cream/80"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--s-1)] px-2">
              <ArrowUpDown className="h-3.5 w-3.5 text-cream/45" />
              <select
                value={sortField}
                onChange={(e) => setSortField(e.target.value as SortField)}
                className="bg-transparent py-2 pr-1 text-xs text-cream/80 focus:outline-none"
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
          onClose={() => {
            setSelectedTask(null)
            setSearchParams(
              (prev) => {
                const p = new URLSearchParams(prev)
                p.delete('taskId')
                return p
              },
              { replace: true },
            )
          }}
          onUpdate={handleUpdateTask}
        />
      )}
    </div>
  )
}
