import { useState } from 'react'
import { X, User, Calendar } from 'lucide-react'
import type { TaskDomain, TaskPriority, NewBusinessTask } from '../../hooks/useBusinessTasks'

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
          {DOMAINS.map((d) => (
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
