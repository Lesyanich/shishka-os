import { useState } from 'react'
import { X, User, Calendar } from 'lucide-react'
import type { TaskDomain, TaskPriority, NewBusinessTask } from '../../hooks/useBusinessTasks'
import { useStaffList } from '../../hooks/useStaffList'

const DOMAINS: { id: TaskDomain; label: string }[] = [
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'procurement', label: 'Procurement' },
  { id: 'finance', label: 'Finance' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'ops', label: 'Ops' },
  { id: 'sales', label: 'Sales' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'tech', label: 'Tech' },
]

export interface QuickAddFormProps {
  onSubmit: (task: NewBusinessTask) => void
  onCancel: () => void
  activeDomain: TaskDomain | 'all'
}

export function QuickAddForm({ onSubmit, onCancel, activeDomain }: QuickAddFormProps) {
  const { people } = useStaffList()
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
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-[var(--line-strong)] bg-[var(--s-1)] p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-cream">Quick Add Task</h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-cream/45 hover:text-cream/80 transition"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Title */}
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task title..."
        className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--s-2)] px-3 py-2 text-sm text-cream placeholder:text-cream/45 focus:border-forest-soft/50 focus:outline-none focus:ring-1 focus:ring-forest-soft/30"
      />

      {/* Domain + Priority row */}
      <div className="flex gap-2">
        <select
          value={domain}
          onChange={(e) => setDomain(e.target.value as TaskDomain)}
          className="flex-1 rounded-lg border border-[var(--line-strong)] bg-[var(--s-2)] px-3 py-2 text-sm text-cream focus:border-forest-soft/50 focus:outline-none"
        >
          {DOMAINS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as TaskPriority)}
          className="flex-1 rounded-lg border border-[var(--line-strong)] bg-[var(--s-2)] px-3 py-2 text-sm text-cream focus:border-forest-soft/50 focus:outline-none"
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
        className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--s-2)] px-3 py-2 text-sm text-cream placeholder:text-cream/45 focus:border-forest-soft/50 focus:outline-none resize-none"
      />

      {/* Assigned + Due date row */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <User className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-cream/45" />
          <select
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            className="w-full appearance-none rounded-lg border border-[var(--line-strong)] bg-[var(--s-2)] pl-8 pr-3 py-2 text-sm text-cream focus:border-forest-soft/50 focus:outline-none"
          >
            <option value="">Unassigned</option>
            {people.map((p) => (
              <option key={p.id} value={p.name}>
                {p.name} — {p.role}
              </option>
            ))}
          </select>
        </div>
        <div className="relative flex-1">
          <Calendar className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-cream/45" />
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--s-2)] pl-8 pr-3 py-2 text-sm text-cream focus:border-forest-soft/50 focus:outline-none"
          />
        </div>
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-xs text-cream/60 hover:text-cream transition"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!title.trim()}
          className="rounded-lg bg-[var(--color-royal-green)] px-4 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-royal-soft)] disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          Add Task
        </button>
      </div>
    </form>
  )
}
