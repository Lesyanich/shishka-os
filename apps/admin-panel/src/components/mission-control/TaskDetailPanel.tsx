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
import type { BusinessTask, TaskDomain, TaskStatus, TaskPriority } from '../../hooks/useBusinessTasks'

// ── Config maps ──

const DOMAIN_CONFIG: Record<TaskDomain, { label: string; icon: typeof ChefHat; color: string }> = {
  kitchen: { label: 'Kitchen', icon: ChefHat, color: 'text-orange-300' },
  procurement: { label: 'Procurement', icon: Truck, color: 'text-blue-300' },
  finance: { label: 'Finance', icon: DollarSign, color: 'text-emerald-300' },
  marketing: { label: 'Marketing', icon: Megaphone, color: 'text-pink-300' },
  ops: { label: 'Ops', icon: Wrench, color: 'text-yellow-300' },
  sales: { label: 'Sales', icon: ShoppingCart, color: 'text-violet-300' },
  strategy: { label: 'Strategy', icon: Target, color: 'text-cyan-300' },
  tech: { label: 'Tech', icon: Cpu, color: 'text-slate-300' },
}

const STATUS_OPTIONS: { value: TaskStatus; label: string; icon: typeof Inbox; color: string }[] = [
  { value: 'inbox', label: 'Inbox', icon: Inbox, color: 'text-slate-300' },
  { value: 'backlog', label: 'Backlog', icon: ListTodo, color: 'text-blue-300' },
  { value: 'in_progress', label: 'In Progress', icon: PlayCircle, color: 'text-amber-300' },
  { value: 'blocked', label: 'Blocked', icon: Ban, color: 'text-red-300' },
  { value: 'done', label: 'Done', icon: CheckCircle2, color: 'text-emerald-300' },
  { value: 'cancelled', label: 'Cancelled', icon: X, color: 'text-slate-500' },
]

const PRIORITY_OPTIONS: { value: TaskPriority; label: string; icon: typeof AlertTriangle; color: string }[] = [
  { value: 'critical', label: 'Critical', icon: AlertTriangle, color: 'text-red-400' },
  { value: 'high', label: 'High', icon: ArrowUp, color: 'text-orange-400' },
  { value: 'medium', label: 'Medium', icon: Minus, color: 'text-slate-400' },
  { value: 'low', label: 'Low', icon: ArrowDown, color: 'text-slate-600' },
]

const ALL_DOMAINS: TaskDomain[] = ['kitchen', 'procurement', 'finance', 'marketing', 'ops', 'sales', 'strategy', 'tech']

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
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-slate-800 bg-slate-950 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <DomainIcon className={`h-4 w-4 ${domainCfg.color}`} />
            <span className="text-sm font-semibold text-slate-100">Task Details</span>
          </div>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <button
                onClick={handleSave}
                disabled={saving || !title.trim()}
                className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-40 transition"
              >
                <Save className="h-3 w-3" />
                {saving ? 'Saving...' : 'Save'}
              </button>
            )}
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition">
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
              className="w-full border-0 bg-transparent text-lg font-semibold text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-0"
              placeholder="Task title..."
            />
          </div>

          {/* Status + Priority row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500">Status</label>
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
                          ? 'bg-slate-800 text-slate-100 ring-1 ring-slate-600'
                          : 'text-slate-500 hover:bg-slate-900 hover:text-slate-300',
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
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500">Priority</label>
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
                          ? 'bg-slate-800 text-slate-100 ring-1 ring-slate-600'
                          : 'text-slate-500 hover:bg-slate-900 hover:text-slate-300',
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
            <label className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-slate-500">
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
                        ? 'bg-slate-800 text-slate-100 ring-1 ring-slate-600'
                        : 'text-slate-500 hover:bg-slate-900 hover:text-slate-300',
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
            <label className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-slate-500">
              <FileText className="h-3 w-3" /> Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add description..."
              rows={3}
              className="w-full rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-slate-700 focus:outline-none resize-none"
            />
          </div>

          {/* Assigned + Due date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                <User className="h-3 w-3" /> Assigned to
              </label>
              <input
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                placeholder="e.g. lesia, chef"
                className="w-full rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-slate-700 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                <Calendar className="h-3 w-3" /> Due date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-sm text-slate-200 focus:border-slate-700 focus:outline-none"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-slate-500">
              <FileText className="h-3 w-3" /> Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes..."
              rows={3}
              className="w-full rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-slate-700 focus:outline-none resize-none"
            />
          </div>

          {/* Tags (read-only for now) */}
          {task.tags && task.tags.length > 0 && (
            <div>
              <label className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                <Tag className="h-3 w-3" /> Tags
              </label>
              <div className="flex flex-wrap gap-1">
                {task.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-slate-800 px-2.5 py-1 text-[11px] text-slate-400">
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="rounded-lg border border-slate-800/50 bg-slate-900/30 p-3 space-y-1.5">
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <Clock className="h-3 w-3" />
              Created: {new Date(task.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
              <span className="text-slate-700">({timeAgo(task.created_at)})</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <Clock className="h-3 w-3" />
              Updated: {new Date(task.updated_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
              <span className="text-slate-700">({timeAgo(task.updated_at)})</span>
            </div>
            {task.completed_at && (
              <div className="flex items-center gap-2 text-[11px] text-emerald-500">
                <CheckCircle2 className="h-3 w-3" />
                Completed: {new Date(task.completed_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
              </div>
            )}
            {task.source && (
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                Source: <span className="text-slate-400">{task.source}</span>
              </div>
            )}
            {task.created_by && (
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                Created by: <span className="text-slate-400">{task.created_by}</span>
              </div>
            )}
            {task.executor_type && (
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                Executor: <span className={
                  task.executor_type === 'human' ? 'text-emerald-400' :
                  task.executor_type === 'code' ? 'text-blue-400' : 'text-violet-400'
                }>{task.executor_type}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-[11px] text-slate-600 font-mono">
              ID: {task.id.slice(0, 8)}...
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 px-5 py-3">
          <button
            onClick={handleCancel}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition"
          >
            <Trash2 className="h-3 w-3" />
            Cancel Task
          </button>
          {hasChanges && (
            <button
              onClick={handleSave}
              disabled={saving || !title.trim()}
              className="flex items-center gap-1 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-40 transition"
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
