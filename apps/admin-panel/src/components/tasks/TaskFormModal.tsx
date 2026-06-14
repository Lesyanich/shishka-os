import { useState } from 'react'
import { X } from 'lucide-react'
import type { Staff } from '../../hooks/useStaff'
import type {
  StaffTask,
  StaffTaskInsert,
  TaskCategory,
  TaskPriority,
  TaskRecurrence,
} from '../../hooks/useStaffTasks'
import {
  CATEGORY_OPTIONS,
  PRIORITY_OPTIONS,
  WEEKDAYS,
  formatLocalDate,
} from './taskMeta'

interface TaskFormModalProps {
  open: boolean
  initial?: StaffTask | null
  staff: Staff[]
  onClose: () => void
  onSubmit: (input: StaffTaskInsert, notify?: boolean) => Promise<void> | void
}

const INPUT =
  'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none'
const LABEL = 'mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500'

export function TaskFormModal({ open, initial, staff, onClose, onSubmit }: TaskFormModalProps) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [titleTh, setTitleTh] = useState(initial?.title_th ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [assignedTo, setAssignedTo] = useState(initial?.assigned_to ?? '')
  const [category, setCategory] = useState<TaskCategory>(initial?.category ?? 'general')
  const [priority, setPriority] = useState<TaskPriority>(initial?.priority ?? 'medium')
  const [recurrence, setRecurrence] = useState<TaskRecurrence>(initial?.recurrence ?? 'none')
  const [days, setDays] = useState<number[]>(initial?.recurrence_days ?? [])
  const [dueDate, setDueDate] = useState(initial?.due_date ?? formatLocalDate(new Date()))
  const [dueTime, setDueTime] = useState(initial?.due_time?.slice(0, 5) ?? '')
  const [reminder, setReminder] = useState(initial?.reminder_offset_min ?? 30)
  const [notify, setNotify] = useState(true)
  const [saving, setSaving] = useState(false)

  if (!open) return null

  const isTemplate = recurrence !== 'none'
  const canNotify = !initial && !isTemplate && !!assignedTo

  const toggleDay = (d: number) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))

  const handleSubmit = async () => {
    if (!title.trim()) return
    if (recurrence === 'weekly' && days.length === 0) return
    setSaving(true)
    const input: StaffTaskInsert = {
      title: title.trim(),
      title_th: titleTh.trim() || null,
      description: description.trim() || null,
      assigned_to: assignedTo || null,
      category,
      priority,
      recurrence,
      reminder_offset_min: reminder,
      is_template: isTemplate,
      recurrence_days: recurrence === 'weekly' ? days : null,
      due_date: isTemplate ? null : dueDate || null,
      due_time: dueTime ? `${dueTime}:00` : null,
    }
    await onSubmit(input, canNotify && notify)
    setSaving(false)
  }

  const canSubmit = title.trim().length > 0 && !(recurrence === 'weekly' && days.length === 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-100">
            {initial ? 'Edit task' : 'New task'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className={LABEL}>Title (English)</label>
            <input className={INPUT} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Open shop & turn on equipment" />
          </div>

          <div>
            <label className={LABEL}>Title (ไทย)</label>
            <input className={INPUT} value={titleTh} onChange={(e) => setTitleTh(e.target.value)} placeholder="เปิดร้านและเปิดเครื่อง" />
          </div>

          <div>
            <label className={LABEL}>Notes</label>
            <textarea className={INPUT} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional details" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Assignee</label>
              <select className={INPUT} value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                <option value="">Unassigned</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>Category</label>
              <select className={INPUT} value={category} onChange={(e) => setCategory(e.target.value as TaskCategory)}>
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Priority</label>
              <select className={INPUT} value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>Repeats</label>
              <select className={INPUT} value={recurrence} onChange={(e) => setRecurrence(e.target.value as TaskRecurrence)}>
                <option value="none">One-off</option>
                <option value="daily">Every day</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
          </div>

          {recurrence === 'weekly' && (
            <div>
              <label className={LABEL}>On days</label>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((w) => (
                  <button
                    key={w.value}
                    type="button"
                    onClick={() => toggleDay(w.value)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                      days.includes(w.value)
                        ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            {!isTemplate && (
              <div>
                <label className={LABEL}>Due date</label>
                <input type="date" className={INPUT} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            )}
            <div>
              <label className={LABEL}>{isTemplate ? 'Time of day' : 'Due time'}</label>
              <input type="time" className={INPUT} value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
            </div>
            <div>
              <label className={LABEL}>Remind (min before)</label>
              <input type="number" min={0} step={5} className={INPUT} value={reminder} onChange={(e) => setReminder(Number(e.target.value))} />
            </div>
          </div>

          {isTemplate && (
            <p className="text-[11px] text-slate-500">
              Recurring tasks generate a fresh instance for staff each matching day.
            </p>
          )}
        </div>

        {canNotify && (
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={notify}
              onChange={(e) => setNotify(e.target.checked)}
              className="h-4 w-4 rounded border-slate-700 bg-slate-900 accent-emerald-500"
            />
            Send to Telegram now
          </label>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || saving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40"
          >
            {saving ? 'Saving…' : initial ? 'Save changes' : 'Create task'}
          </button>
        </div>
      </div>
    </div>
  )
}
