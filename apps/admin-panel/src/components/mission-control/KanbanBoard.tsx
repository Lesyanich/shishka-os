import {
  Inbox,
  ListTodo,
  PlayCircle,
  Ban,
  CheckCircle2,
  AlertTriangle,
  ArrowUp,
  Minus,
  ArrowDown,
  ChefHat,
  Truck,
  DollarSign,
  Megaphone,
  Wrench,
  ShoppingCart,
  Target,
  Cpu,
  User,
  Calendar,
  ChevronRight,
} from 'lucide-react'
import type {
  BusinessTask,
  TaskDomain,
  TaskStatus,
  TaskPriority,
} from '../../hooks/useBusinessTasks'

// ── Tag colors ──

const TAG_COLORS: Record<string, string> = {
  'has-spec': 'bg-forest-soft/40 text-mint-200 border-forest-soft/30',
  blocked: 'bg-brick-soft/40 text-brick-bright border-brick-soft/30',
  'needs-hardware': 'bg-amber-watch/40 text-amber-watch border-amber-watch/30',
  'quick-win': 'bg-honey-300/40 text-honey-300 border-honey-300/30',
}
const DEFAULT_TAG_COLOR = 'bg-[var(--s-2)] text-cream/45 border-[var(--line-strong)]'

// ── Column config ──

interface ColumnDef {
  status: TaskStatus
  label: string
  icon: typeof Inbox
  borderColor: string
  dotColor: string
  badgeColor: string
}

const KANBAN_COLUMNS: ColumnDef[] = [
  {
    status: 'inbox',
    label: 'Inbox',
    icon: Inbox,
    borderColor: 'border-[var(--line-strong)]',
    dotColor: 'bg-[var(--s-3)]',
    badgeColor: 'bg-[var(--s-3)] text-cream/80 border-[var(--line-strong)]',
  },
  {
    status: 'backlog',
    label: 'Backlog',
    icon: ListTodo,
    borderColor: 'border-honey-300/30',
    dotColor: 'bg-honey-300',
    badgeColor: 'bg-honey-300/10 text-honey-300 border-honey-300/20',
  },
  {
    status: 'in_progress',
    label: 'In Progress',
    icon: PlayCircle,
    borderColor: 'border-amber-watch/30',
    dotColor: 'bg-amber-watch animate-pulse',
    badgeColor: 'bg-amber-watch/10 text-amber-watch border-amber-watch/20',
  },
  {
    status: 'blocked',
    label: 'Blocked',
    icon: Ban,
    borderColor: 'border-brick-soft/30',
    dotColor: 'bg-[var(--color-royal-red)]',
    badgeColor: 'bg-brick-soft/10 text-brick-bright border-brick-soft/20',
  },
  {
    status: 'done',
    label: 'Done',
    icon: CheckCircle2,
    borderColor: 'border-forest-soft/30',
    dotColor: 'bg-[var(--color-royal-soft)]',
    badgeColor: 'bg-forest-soft/10 text-mint-200 border-forest-soft/20',
  },
]

const DOMAIN_ICONS: Record<TaskDomain, typeof ChefHat> = {
  kitchen: ChefHat,
  procurement: Truck,
  finance: DollarSign,
  marketing: Megaphone,
  ops: Wrench,
  sales: ShoppingCart,
  strategy: Target,
  tech: Cpu,
}

const DOMAIN_DOT_COLORS: Record<TaskDomain, string> = {
  kitchen: 'bg-nutri-fat',
  procurement: 'bg-amber-watch',
  finance: 'bg-forest-soft',
  marketing: 'bg-nutri-car',
  ops: 'bg-honey-300',
  sales: 'bg-brick-soft',
  strategy: 'bg-honey-600',
  tech: 'bg-nutri-pro',
}

const PRIORITY_ICONS: Record<
  TaskPriority,
  { icon: typeof AlertTriangle; color: string; badgeColor: string }
> = {
  critical: {
    icon: AlertTriangle,
    color: 'text-brick-bright',
    badgeColor: 'bg-brick-soft/30 text-brick-bright',
  },
  high: {
    icon: ArrowUp,
    color: 'text-amber-watch',
    badgeColor: 'bg-amber-watch/25 text-amber-watch',
  },
  medium: { icon: Minus, color: 'text-honey-300', badgeColor: 'bg-honey-300/30 text-honey-300' },
  low: { icon: ArrowDown, color: 'text-cream/60', badgeColor: 'bg-[var(--s-2)] text-cream/60' },
}

// ── Status transition: next logical status ──

const STATUS_FLOW: Record<TaskStatus, TaskStatus | null> = {
  inbox: 'backlog',
  backlog: 'in_progress',
  in_progress: 'done',
  blocked: 'in_progress',
  done: null,
  cancelled: null,
}

// ── Kanban Card ──

function KanbanCard({
  task,
  onMoveForward,
  onOpenDetail,
}: {
  task: BusinessTask
  onMoveForward: (id: string, newStatus: TaskStatus) => void
  onOpenDetail: (task: BusinessTask) => void
}) {
  const PriorityIcon = PRIORITY_ICONS[task.priority].icon
  const DomainIcon = DOMAIN_ICONS[task.domain]
  const domainDot = DOMAIN_DOT_COLORS[task.domain]
  const nextStatus = STATUS_FLOW[task.status]

  return (
    <div
      onClick={() => onOpenDetail(task)}
      className="group cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--s-1)] p-3 transition hover:border-[var(--line-strong)] hover:bg-[var(--s-2)]"
    >
      {/* Top row: priority badge + title */}
      <div className="flex items-start gap-2">
        <span
          className={`mt-0.5 inline-flex shrink-0 rounded p-0.5 ${PRIORITY_ICONS[task.priority].badgeColor}`}
        >
          <PriorityIcon className="h-3 w-3" />
        </span>
        <p className="text-xs font-medium leading-snug text-cream line-clamp-2">{task.title}</p>
      </div>

      {/* Description */}
      {task.description && (
        <p className="mt-1 pl-5 text-[11px] text-cream/45 line-clamp-1">{task.description}</p>
      )}

      {/* Tags */}
      {task.tags && task.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1 pl-5">
          {task.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className={`rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${TAG_COLORS[tag] ?? DEFAULT_TAG_COLOR}`}
            >
              {tag}
            </span>
          ))}
          {task.tags.length > 3 && (
            <span className="rounded-full bg-[var(--s-2)] px-1.5 py-0.5 text-[9px] text-cream/45">
              +{task.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Bottom row: domain + assigned + move button */}
      <div className="mt-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[10px] text-cream/60">
            <span className={`h-1.5 w-1.5 rounded-full ${domainDot}`} />
            <DomainIcon className="h-2.5 w-2.5" />
          </span>
          {task.assigned_to && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-cream/45">
              <User className="h-2.5 w-2.5" />
              {task.assigned_to}
            </span>
          )}
          {task.due_date && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-cream/45">
              <Calendar className="h-2.5 w-2.5" />
              {new Date(task.due_date).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
              })}
            </span>
          )}
        </div>

        {/* Move forward button */}
        {nextStatus && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onMoveForward(task.id, nextStatus)
            }}
            title={`Move to ${nextStatus.replace('_', ' ')}`}
            className="rounded p-0.5 text-cream/30 opacity-0 transition hover:bg-[var(--s-2)] hover:text-mint-200 group-hover:opacity-100"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

// ── Skeleton ──

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-lg border border-[var(--line)] bg-[var(--s-1)] p-3">
      <div className="mb-2 h-3 w-3/4 rounded bg-[var(--s-2)]" />
      <div className="h-2.5 w-1/2 rounded bg-[var(--s-2)]" />
    </div>
  )
}

// ── KanbanBoard ──

interface KanbanBoardProps {
  tasks: BusinessTask[]
  isLoading: boolean
  onMoveTask: (id: string, newStatus: TaskStatus) => void
  onOpenDetail: (task: BusinessTask) => void
  showDone?: boolean
  activeStatus?: TaskStatus | null
}

export function KanbanBoard({
  tasks,
  isLoading,
  onMoveTask,
  onOpenDetail,
  showDone,
  activeStatus,
}: KanbanBoardProps) {
  const byStatus: Record<string, BusinessTask[]> = {}
  for (const task of tasks) {
    const s = task.status
    if (!byStatus[s]) byStatus[s] = []
    byStatus[s].push(task)
  }

  // Filter visible columns: hide done/cancelled unless showDone, respect activeStatus
  const visibleColumns = KANBAN_COLUMNS.filter((col) => {
    if (activeStatus) return col.status === activeStatus
    if (!showDone && (col.status === 'done' || col.status === 'cancelled')) return false
    return true
  })

  const gridCols =
    visibleColumns.length <= 3
      ? 'md:grid-cols-3'
      : visibleColumns.length === 4
        ? 'md:grid-cols-2 lg:grid-cols-4'
        : 'md:grid-cols-3 lg:grid-cols-5'

  return (
    <div className={`grid grid-cols-1 gap-3 ${gridCols}`}>
      {visibleColumns.map((col) => {
        const colTasks = byStatus[col.status] ?? []
        const Icon = col.icon

        return (
          <div key={col.status} className="flex flex-col gap-2">
            {/* Column header */}
            <div
              className={`flex items-center justify-between rounded-lg border ${col.borderColor} bg-[var(--s-1)] px-3 py-2`}
            >
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${col.dotColor}`} />
                <Icon className="h-3.5 w-3.5 text-cream/60" />
                <span className="text-xs font-medium text-cream">{col.label}</span>
              </div>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${col.badgeColor}`}
              >
                {isLoading ? '-' : colTasks.length}
              </span>
            </div>

            {/* Cards */}
            <div className="flex max-h-[calc(100vh-320px)] flex-col gap-1.5 overflow-y-auto pr-0.5">
              {isLoading ? (
                <>
                  <SkeletonCard />
                  <SkeletonCard />
                </>
              ) : colTasks.length === 0 ? (
                <p className="px-2 py-6 text-center text-[11px] text-cream/30">Empty</p>
              ) : (
                colTasks.map((task) => (
                  <KanbanCard
                    key={task.id}
                    task={task}
                    onMoveForward={onMoveTask}
                    onOpenDetail={onOpenDetail}
                  />
                ))
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
