import { useState } from 'react'
import {
  X,
  Save,
  Trash2,
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
  Clock,
  Tag,
  FileText,
} from 'lucide-react'
import type {
  BusinessTask,
  TaskDomain,
  TaskStatus,
  TaskPriority,
} from '../../hooks/useBusinessTasks'
import { useStaffList } from '../../hooks/useStaffList'

// ── Config maps ──

const DOMAIN_CONFIG: Record<TaskDomain, { label: string; icon: typeof ChefHat; color: string }> = {
  kitchen: { label: 'Kitchen', icon: ChefHat, color: 'text-nutri-fat' },
  procurement: { label: 'Procurement', icon: Truck, color: 'text-honey-300' },
  finance: { label: 'Finance', icon: DollarSign, color: 'text-mint-200' },
  marketing: { label: 'Marketing', icon: Megaphone, color: 'text-nutri-car' },
  ops: { label: 'Ops', icon: Wrench, color: 'text-amber-watch' },
  sales: { label: 'Sales', icon: ShoppingCart, color: 'text-nutri-car' },
  strategy: { label: 'Strategy', icon: Target, color: 'text-honey-300' },
  tech: { label: 'Tech', icon: Cpu, color: 'text-cream/80' },
}

const STATUS_OPTIONS: { value: TaskStatus; label: string; icon: typeof Inbox; color: string }[] = [
  { value: 'inbox', label: 'Inbox', icon: Inbox, color: 'text-cream/80' },
  { value: 'backlog', label: 'Backlog', icon: ListTodo, color: 'text-honey-300' },
  { value: 'in_progress', label: 'In Progress', icon: PlayCircle, color: 'text-amber-watch' },
  { value: 'blocked', label: 'Blocked', icon: Ban, color: 'text-brick-bright' },
  { value: 'done', label: 'Done', icon: CheckCircle2, color: 'text-mint-200' },
  { value: 'cancelled', label: 'Cancelled', icon: X, color: 'text-cream/45' },
]

const PRIORITY_OPTIONS: {
  value: TaskPriority
  label: string
  icon: typeof AlertTriangle
  color: string
}[] = [
  { value: 'critical', label: 'Critical', icon: AlertTriangle, color: 'text-brick-bright' },
  { value: 'high', label: 'High', icon: ArrowUp, color: 'text-amber-watch' },
  { value: 'medium', label: 'Medium', icon: Minus, color: 'text-cream/60' },
  { value: 'low', label: 'Low', icon: ArrowDown, color: 'text-cream/30' },
]

const ALL_DOMAINS: TaskDomain[] = [
  'kitchen',
  'procurement',
  'finance',
  'marketing',
  'ops',
  'sales',
  'strategy',
  'tech',
]

// ── Helpers ──

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ── Component ──

interface TaskDetailPanelProps {
  task: BusinessTask
  onClose: () => void
  onUpdate: (id: string, updates: Partial<BusinessTask>) => Promise<boolean>
}

export function TaskDetailPanel({ task, onClose, onUpdate }: TaskDetailPanelProps) {
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? '')
  const [status, setStatus] = useState<TaskStatus>(task.status)
  const [priority, setPriority] = useState<TaskPriority>(task.priority)
  const [domain, setDomain] = useState<TaskDomain>(task.domain)
  const [assignedTo, setAssignedTo] = useState(task.assigned_to ?? '')
  const [dueDate, setDueDate] = useState(task.due_date ?? '')
  const [notes, setNotes] = useState(task.notes ?? '')
  const [saving, setSaving] = useState(false)
  const { people } = useStaffList()

  const hasChanges =
    title !== task.title ||
    description !== (task.description ?? '') ||
    status !== task.status ||
    priority !== task.priority ||
    domain !== task.domain ||
    assignedTo !== (task.assigned_to ?? '') ||
    dueDate !== (task.due_date ?? '') ||
    notes !== (task.notes ?? '')

  const handleSave = async () => {
    if (!title.trim() || !hasChanges) return
    setSaving(true)
    await onUpdate(task.id, {
      title: title.trim(),
      description: description.trim() || null,
      status,
      priority,
      domain,
      assigned_to: assignedTo.trim() || null,
      due_date: dueDate || null,
      notes: notes.trim() || null,
    })
    setSaving(false)
  }

  const handleCancel = async () => {
    await onUpdate(task.id, { status: 'cancelled' })
    onClose()
  }

  const domainCfg = DOMAIN_CONFIG[domain]
  const DomainIcon = domainCfg.icon

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel (slide-in from right) */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-[var(--line)] bg-[var(--s-0)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
          <div className="flex items-center gap-2">
            <DomainIcon className={`h-4 w-4 ${domainCfg.color}`} />
            <span className="text-sm font-semibold text-cream">Task Details</span>
          </div>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <button
                onClick={handleSave}
                disabled={saving || !title.trim()}
                className="flex items-center gap-1 rounded-lg bg-[var(--color-royal-green)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-royal-soft)] disabled:opacity-40 transition"
              >
                <Save className="h-3 w-3" />
                {saving ? 'Saving...' : 'Save'}
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-cream/45 hover:bg-[var(--s-2)] hover:text-cream/80 transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Title */}
          <div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border-0 bg-transparent text-lg font-semibold text-cream placeholder:text-cream/30 focus:outline-none focus:ring-0"
              placeholder="Task title..."
            />
          </div>

          {/* Status + Priority row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-cream/45">
                Status
              </label>
              <div className="flex flex-wrap gap-1">
                {STATUS_OPTIONS.map((opt) => {
                  const Icon = opt.icon
                  const isActive = status === opt.value
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setStatus(opt.value)}
                      className={[
                        'flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium transition',
                        isActive
                          ? 'bg-[var(--s-2)] text-cream ring-1 ring-[var(--line-strong)]'
                          : 'text-cream/45 hover:bg-[var(--s-1)] hover:text-cream/80',
                      ].join(' ')}
                    >
                      <Icon className={`h-3 w-3 ${isActive ? opt.color : ''}`} />
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-cream/45">
                Priority
              </label>
              <div className="flex gap-1">
                {PRIORITY_OPTIONS.map((opt) => {
                  const Icon = opt.icon
                  const isActive = priority === opt.value
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setPriority(opt.value)}
                      className={[
                        'flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium transition',
                        isActive
                          ? 'bg-[var(--s-2)] text-cream ring-1 ring-[var(--line-strong)]'
                          : 'text-cream/45 hover:bg-[var(--s-1)] hover:text-cream/80',
                      ].join(' ')}
                    >
                      <Icon className={`h-3 w-3 ${isActive ? opt.color : ''}`} />
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Domain */}
          <div>
            <label className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-cream/45">
              <Tag className="h-3 w-3" /> Domain
            </label>
            <div className="flex flex-wrap gap-1">
              {ALL_DOMAINS.map((d) => {
                const cfg = DOMAIN_CONFIG[d]
                const Icon = cfg.icon
                const isActive = domain === d
                return (
                  <button
                    key={d}
                    onClick={() => setDomain(d)}
                    className={[
                      'flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium transition',
                      isActive
                        ? 'bg-[var(--s-2)] text-cream ring-1 ring-[var(--line-strong)]'
                        : 'text-cream/45 hover:bg-[var(--s-1)] hover:text-cream/80',
                    ].join(' ')}
                  >
                    <Icon className={`h-3 w-3 ${isActive ? cfg.color : ''}`} />
                    {cfg.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-cream/45">
              <FileText className="h-3 w-3" /> Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add description..."
              rows={3}
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--s-1)] px-3 py-2 text-sm text-cream placeholder:text-cream/30 focus:border-[var(--line-strong)] focus:outline-none resize-none"
            />
          </div>

          {/* Assigned + Due date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-cream/45">
                <User className="h-3 w-3" /> Assigned to
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-cream/45" />
                <select
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-[var(--line-strong)] bg-[var(--s-2)] pl-9 pr-3 py-2 text-sm text-cream focus:border-forest-soft/50 focus:outline-none"
                >
                  <option value="">Unassigned</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name} — {p.role}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-cream/45">
                <Calendar className="h-3 w-3" /> Due date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-[var(--line)] bg-[var(--s-1)] px-3 py-2 text-sm text-cream focus:border-[var(--line-strong)] focus:outline-none"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-cream/45">
              <FileText className="h-3 w-3" /> Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes..."
              rows={3}
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--s-1)] px-3 py-2 text-sm text-cream placeholder:text-cream/30 focus:border-[var(--line-strong)] focus:outline-none resize-none"
            />
          </div>

          {/* Tags (read-only for now) */}
          {task.tags && task.tags.length > 0 && (
            <div>
              <label className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-cream/45">
                <Tag className="h-3 w-3" /> Tags
              </label>
              <div className="flex flex-wrap gap-1">
                {task.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-[var(--s-2)] px-2.5 py-1 text-[11px] text-cream/60"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="rounded-lg border border-[var(--line)] bg-[var(--s-1)] p-3 space-y-1.5">
            <div className="flex items-center gap-2 text-[11px] text-cream/45">
              <Clock className="h-3 w-3" />
              Created:{' '}
              {new Date(task.created_at).toLocaleString('en-GB', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
              <span className="text-cream/30">({timeAgo(task.created_at)})</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-cream/45">
              <Clock className="h-3 w-3" />
              Updated:{' '}
              {new Date(task.updated_at).toLocaleString('en-GB', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
              <span className="text-cream/30">({timeAgo(task.updated_at)})</span>
            </div>
            {task.completed_at && (
              <div className="flex items-center gap-2 text-[11px] text-mint-200">
                <CheckCircle2 className="h-3 w-3" />
                Completed:{' '}
                {new Date(task.completed_at).toLocaleString('en-GB', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </div>
            )}
            {task.source && (
              <div className="flex items-center gap-2 text-[11px] text-cream/45">
                Source: <span className="text-cream/60">{task.source}</span>
              </div>
            )}
            {task.created_by && (
              <div className="flex items-center gap-2 text-[11px] text-cream/45">
                Created by: <span className="text-cream/60">{task.created_by}</span>
              </div>
            )}
            {task.executor_type && (
              <div className="flex items-center gap-2 text-[11px] text-cream/45">
                Executor:{' '}
                <span
                  className={
                    task.executor_type === 'human'
                      ? 'text-mint-200'
                      : task.executor_type === 'code'
                        ? 'text-honey-300'
                        : 'text-cream/90'
                  }
                >
                  {task.executor_type}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2 text-[11px] text-cream/30 font-mono">
              ID: {task.id.slice(0, 8)}...
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--line)] px-5 py-3">
          <button
            onClick={handleCancel}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-brick-bright hover:bg-brick-soft/10 transition"
          >
            <Trash2 className="h-3 w-3" />
            Cancel Task
          </button>
          {hasChanges && (
            <button
              onClick={handleSave}
              disabled={saving || !title.trim()}
              className="flex items-center gap-1 rounded-lg bg-[var(--color-royal-green)] px-4 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-royal-soft)] disabled:opacity-40 transition"
            >
              <Save className="h-3 w-3" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          )}
        </div>
      </div>
    </>
  )
}
