import { useState } from 'react'
import {
  Rocket,
  Plus,
  X,
  Loader2,
  ChefHat,
  Truck,
  DollarSign,
  Megaphone,
  Wrench,
  ShoppingCart,
  Target,
  Cpu,
  AlertTriangle,
  ArrowUp,
  Minus,
  ArrowDown,
  Inbox,
  ListTodo,
  PlayCircle,
  Ban,
  CheckCircle2,
  Calendar,
  User,
  List,
  Columns3,
} from 'lucide-react'
import {
  useBusinessTasks,
  type BusinessTask,
  type TaskDomain,
  type TaskStatus,
  type TaskPriority,
  type NewBusinessTask,
} from '../hooks/useBusinessTasks'
import { KanbanBoard } from '../components/mission-control/KanbanBoard'
import { TaskDetailPanel } from '../components/mission-control/TaskDetailPanel'

// ── Domain config ──

const DOMAINS: { id: TaskDomain | 'all'; label: string; icon: typeof ChefHat }[] = [
  { id: 'all', label: 'All', icon: Rocket },
  { id: 'kitchen', label: 'Kitchen', icon: ChefHat },
  { id: 'procurement', label: 'Procurement', icon: Truck },
  { id: 'finance', label: 'Finance', icon: DollarSign },
  { id: 'marketing', label: 'Marketing', icon: Megaphone },
  { id: 'ops', label: 'Ops', icon: Wrench },
  { id: 'sales', label: 'Sales', icon: ShoppingCart },
  { id: 'strategy', label: 'Strategy', icon: Target },
  { id: 'tech', label: 'Tech', icon: Cpu },
]

const DOMAIN_COLORS: Record<TaskDomain, string> = {
  kitchen: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  procurement: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  finance: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  marketing: 'bg-pink-500/15 text-pink-300 border-pink-500/30',
  ops: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
  sales: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  strategy: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  tech: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
}

const STATUS_CONFIG: Record<TaskStatus, { label: string; icon: typeof Inbox; color: string }> = {
  inbox: { label: 'Inbox', icon: Inbox, color: 'bg-slate-500/15 text-slate-300' },
  backlog: { label: 'Backlog', icon: ListTodo, color: 'bg-blue-500/15 text-blue-300' },
  in_progress: { label: 'In Progress', icon: PlayCircle, color: 'bg-amber-500/15 text-amber-300' },
  blocked: { label: 'Blocked', icon: Ban, color: 'bg-red-500/15 text-red-300' },
  done: { label: 'Done', icon: CheckCircle2, color: 'bg-emerald-500/15 text-emerald-300' },
  cancelled: { label: 'Cancelled', icon: X, color: 'bg-slate-600/15 text-slate-500' },
}

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; icon: typeof AlertTriangle; color: string }> = {
  critical: { label: 'Critical', icon: AlertTriangle, color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  high: { label: 'High', icon: ArrowUp, color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
  medium: { label: 'Medium', icon: Minus, color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  low: { label: 'Low', icon: ArrowDown, color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
}

type ViewMode = 'list' | 'kanban'

// ── Quick Add Form ──

function QuickAddForm({
  onSubmit,
  onCancel,
  activeDomain,
}: {
  onSubmit: (task: NewBusinessTask) => void
  onCancel: () => void
  activeDomain: TaskDomain | 'all'
}) {
  const [title, setTitle] = useState('')
  const [domain, setDomain] = useState<TaskDomain>(activeDomain === 'all' ? 'ops' : activeDomain)
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [description, setDescription] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [dueDate, setDueDate] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    onSubmit({
      title: title.trim(),
      domain,
      priority,
      description: description.trim() || undefined,
      assigned_to: assignedTo.trim() || undefined,
      due_date: dueDate || undefined,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-slate-700/50 bg-slate-900/80 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Quick Add Task</h3>
        <button type="button" onClick={onCancel} className="text-slate-500 hover:text-slate-300 transition">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Title */}
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task title..."
        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
      />

      {/* Domain + Priority row */}
      <div className="flex gap-2">
        <select
          value={domain}
          onChange={(e) => setDomain(e.target.value as TaskDomain)}
          className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-emerald-500/50 focus:outline-none"
        >
          {DOMAINS.filter((d) => d.id !== 'all').map((d) => (
            <option key={d.id} value={d.id}>{d.label}</option>
          ))}
        </select>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as TaskPriority)}
          className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-emerald-500/50 focus:outline-none"
        >
          <option value="critical">🔴 Critical</option>
          <option value="high">🟠 High</option>
          <option value="medium">🔵 Medium</option>
          <option value="low">⚪ Low</option>
        </select>
      </div>

      {/* Description */}
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)..."
        rows={2}
        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none resize-none"
      />

      {/* Assigned + Due date row */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <User className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
          <input
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            placeholder="Assigned to..."
            className="w-full rounded-lg border border-slate-700 bg-slate-800 pl-8 pr-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none"
          />
        </div>
        <div className="relative flex-1">
          <Calendar className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 pl-8 pr-3 py-2 text-sm text-slate-200 focus:border-emerald-500/50 focus:outline-none"
          />
        </div>
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!title.trim()}
          className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          Add Task
        </button>
      </div>
    </form>
  )
}

// ── Task List Item ──

function TaskListItem({
  task,
  onOpenDetail,
}: {
  task: BusinessTask
  onOpenDetail: (task: BusinessTask) => void
}) {
  const domainCfg = DOMAIN_COLORS[task.domain]
  const statusCfg = STATUS_CONFIG[task.status]
  const priorityCfg = PRIORITY_CONFIG[task.priority]
  const StatusIcon = statusCfg.icon
  const PriorityIcon = priorityCfg.icon
  const domainObj = DOMAINS.find((d) => d.id === task.domain)
  const DomainIcon = domainObj?.icon ?? Wrench

  return (
    <div
      onClick={() => onOpenDetail(task)}
      className="group flex cursor-pointer items-start gap-3 rounded-xl border border-slate-800/50 bg-slate-900/60 px-4 py-3 hover:border-slate-700/60 hover:bg-slate-900/80 transition"
    >
      {/* Priority indicator */}
      <div className={`mt-0.5 rounded-md p-1 ${priorityCfg.color}`}>
        <PriorityIcon className="h-3.5 w-3.5" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-100 truncate">{task.title}</span>
        </div>

        {task.description && (
          <p className="mt-0.5 text-xs text-slate-500 line-clamp-1">{task.description}</p>
        )}

        {/* Badges row */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${domainCfg}`}>
            <DomainIcon className="h-2.5 w-2.5" />
            {domainObj?.label}
          </span>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusCfg.color}`}>
            <StatusIcon className="h-2.5 w-2.5" />
            {statusCfg.label}
          </span>
          {task.assigned_to && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-700/50 px-2 py-0.5 text-[10px] text-slate-400">
              <User className="h-2.5 w-2.5" />
              {task.assigned_to}
            </span>
          )}
          {task.due_date && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-700/50 px-2 py-0.5 text-[10px] text-slate-400">
              <Calendar className="h-2.5 w-2.5" />
              {new Date(task.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </span>
          )}
          {task.tags?.map((tag) => (
            <span key={tag} className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-500">
              #{tag}
            </span>
          ))}
        </div>
      </div>

      {/* Timestamp */}
      <span className="shrink-0 text-[10px] text-slate-600">
        {new Date(task.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
      </span>
    </div>
  )
}

// ── Main Page ──

export function MissionControl() {
  const [activeDomain, setActiveDomain] = useState<TaskDomain | 'all'>('all')
  const [activeStatus, setActiveStatus] = useState<TaskStatus | null>(null)
  const [showDone, setShowDone] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [selectedTask, setSelectedTask] = useState<BusinessTask | null>(null)
  const { tasks: allTasks, isLoading, error, refetch, addTask, updateTask } = useBusinessTasks(activeDomain)

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

  const handleOpenDetail = (task: BusinessTask) => {
    setSelectedTask(task)
  }

  // Count tasks by status from ALL tasks (before filtering)
  const statusCounts = allTasks.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1
    return acc
  }, {})

  // Filter tasks: hide done/cancelled by default, apply active status filter
  const tasks = allTasks.filter((t) => {
    if (!showDone && (t.status === 'done' || t.status === 'cancelled')) return false
    if (activeStatus && t.status !== activeStatus) return false
    return true
  })

  const handleStatusToggle = (status: TaskStatus) => {
    if (status === 'done' || status === 'cancelled') {
      if (activeStatus === status) {
        setActiveStatus(null)
        setShowDone(false)
      } else {
        setShowDone(true)
        setActiveStatus(status)
      }
    } else {
      setActiveStatus(activeStatus === status ? null : status)
    }
  }

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
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex rounded-lg border border-slate-800 bg-slate-900/50">
            <button
              onClick={() => setViewMode('list')}
              className={[
                'flex items-center gap-1 rounded-l-lg px-2.5 py-1.5 text-xs transition',
                viewMode === 'list'
                  ? 'bg-slate-800 text-emerald-300'
                  : 'text-slate-500 hover:text-slate-300',
              ].join(' ')}
            >
              <List className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">List</span>
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={[
                'flex items-center gap-1 rounded-r-lg px-2.5 py-1.5 text-xs transition',
                viewMode === 'kanban'
                  ? 'bg-slate-800 text-emerald-300'
                  : 'text-slate-500 hover:text-slate-300',
              ].join(' ')}
            >
              <Columns3 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Kanban</span>
            </button>
          </div>

          <button
            onClick={() => setShowQuickAdd(!showQuickAdd)}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-500 transition"
          >
            <Plus className="h-3.5 w-3.5" />
            Quick Add
          </button>
        </div>
      </div>

      {/* Quick Add Form */}
      {showQuickAdd && (
        <QuickAddForm
          onSubmit={handleAddTask}
          onCancel={() => setShowQuickAdd(false)}
          activeDomain={activeDomain}
        />
      )}

      {/* Domain Tabs */}
      <div className="flex gap-1 rounded-xl bg-slate-900/50 p-1 overflow-x-auto">
        {DOMAINS.map(({ id, label, icon: Icon }) => {
          // Count tasks per domain, respecting status filter but not domain filter
          const domainCount = allTasks.filter((t) => {
            if (!showDone && (t.status === 'done' || t.status === 'cancelled')) return false
            if (activeStatus && t.status !== activeStatus) return false
            if (id !== 'all' && t.domain !== id) return false
            return true
          }).length
          return (
            <button
              key={id}
              onClick={() => setActiveDomain(id)}
              className={[
                'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition',
                activeDomain === id
                  ? 'bg-slate-800 text-emerald-300 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200',
              ].join(' ')}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              {domainCount > 0 && (
                <span className="ml-1 rounded-full bg-slate-700 px-1.5 text-[10px] text-slate-300">
                  {domainCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Status summary bar — clickable filters */}
      {!isLoading && allTasks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {(['inbox', 'backlog', 'in_progress', 'blocked', 'done', 'cancelled'] as TaskStatus[]).map((status) => {
            const count = statusCounts[status] ?? 0
            if (count === 0) return null
            const cfg = STATUS_CONFIG[status]
            const Icon = cfg.icon
            const isActive = activeStatus === status
            const isDoneish = status === 'done' || status === 'cancelled'
            return (
              <button
                key={status}
                onClick={() => handleStatusToggle(status)}
                className={[
                  'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all',
                  isActive
                    ? `${cfg.color} ring-1 ring-current`
                    : isDoneish && !showDone
                      ? 'bg-slate-800/50 text-slate-600'
                      : cfg.color,
                ].join(' ')}
              >
                <Icon className="h-3 w-3" />
                {cfg.label}: {count}
              </button>
            )
          })}
          {activeStatus && (
            <button
              onClick={() => { setActiveStatus(null); setShowDone(false) }}
              className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-400 hover:text-slate-200 transition"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          )}
        </div>
      )}

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

      {/* Empty state */}
      {!isLoading && !error && allTasks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500">
          <Rocket className="h-10 w-10 mb-3 text-slate-700" />
          <p className="text-sm">No tasks yet</p>
          <button
            onClick={() => setShowQuickAdd(true)}
            className="mt-2 text-xs text-emerald-400 hover:text-emerald-300 transition"
          >
            Create your first task
          </button>
        </div>
      )}

      {/* Content: List or Kanban */}
      {!isLoading && allTasks.length > 0 && viewMode === 'list' && (
        tasks.length > 0 ? (
          <div className="space-y-2">
            {tasks.map((task) => (
              <TaskListItem key={task.id} task={task} onOpenDetail={handleOpenDetail} />
            ))}
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-slate-600">No tasks match this filter</p>
        )
      )}

      {!isLoading && allTasks.length > 0 && viewMode === 'kanban' && (
        <KanbanBoard
          tasks={tasks}
          isLoading={isLoading}
          onMoveTask={handleMoveTask}
          onOpenDetail={handleOpenDetail}
          showDone={showDone}
          activeStatus={activeStatus}
        />
      )}

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
