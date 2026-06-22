import { useRef, useState } from 'react'
import { Camera, Loader2, X } from 'lucide-react'
import type { Staff } from '../../hooks/useStaff'
import type {
  StaffTask,
  StaffTaskInsert,
  TaskCategory,
  TaskPriority,
  TaskRecurrence,
  TaskStation,
} from '../../hooks/useStaffTasks'
import { useTaskPhotoUpload } from '../../hooks/useTaskPhotoUpload'
import { TaskLinkPicker, type TaskLinkValue } from './TaskLinkPicker'
import {
  CATEGORY_OPTIONS,
  PRIORITY_OPTIONS,
  STATION_OPTIONS,
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

/** Stable id for this form session so photos can be uploaded to the task's
 *  folder before the row is created. */
function freshId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function TaskFormModal({ open, initial, staff, onClose, onSubmit }: TaskFormModalProps) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [titleTh, setTitleTh] = useState(initial?.title_th ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [assignedTo, setAssignedTo] = useState(initial?.assigned_to ?? '')
  const [station, setStation] = useState<TaskStation>(initial?.station ?? 'general')
  const [category, setCategory] = useState<TaskCategory>(initial?.category ?? 'general')
  const [priority, setPriority] = useState<TaskPriority>(initial?.priority ?? 'medium')
  const [recurrence, setRecurrence] = useState<TaskRecurrence>(initial?.recurrence ?? 'none')
  const [days, setDays] = useState<number[]>(initial?.recurrence_days ?? [])
  const [dueDate, setDueDate] = useState(initial?.due_date ?? formatLocalDate(new Date()))
  const [dueTime, setDueTime] = useState(initial?.due_time?.slice(0, 5) ?? '')
  const [reminder, setReminder] = useState(initial?.reminder_offset_min ?? 30)
  const [notify, setNotify] = useState(true)
  const [saving, setSaving] = useState(false)

  const [link, setLink] = useState<TaskLinkValue>({
    linked_route: initial?.linked_route ?? null,
    linked_label: initial?.linked_label ?? null,
    linked_label_th: initial?.linked_label_th ?? null,
  })
  const [photoUrls, setPhotoUrls] = useState<string[]>(initial?.photo_urls ?? [])
  const [taskId] = useState<string>(() => initial?.id ?? freshId())
  const { upload, isUploading } = useTaskPhotoUpload()
  const fileRef = useRef<HTMLInputElement>(null)

  if (!open) return null

  const isTemplate = recurrence !== 'none'
  const canNotify = !initial && !isTemplate && !!assignedTo

  const toggleDay = (d: number) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))

  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    for (const file of files) {
      const res = await upload(file, taskId)
      if (res.ok && res.url) setPhotoUrls((prev) => [...prev, res.url!])
      else if (res.error) window.alert(res.error)
    }
  }

  const handleSubmit = async () => {
    if (!title.trim()) return
    if (recurrence === 'weekly' && days.length === 0) return
    setSaving(true)
    const input: StaffTaskInsert = {
      ...(initial ? {} : { id: taskId }),
      title: title.trim(),
      title_th: titleTh.trim() || null,
      description: description.trim() || null,
      assigned_to: assignedTo || null,
      station,
      category,
      priority,
      recurrence,
      reminder_offset_min: reminder,
      is_template: isTemplate,
      recurrence_days:
        recurrence === 'weekly'
          ? days
          : recurrence === 'monthly'
            ? [Math.min(31, Math.max(1, days[0] ?? 1))]
            : null,
      due_date: isTemplate ? null : dueDate || null,
      due_time: dueTime ? `${dueTime}:00` : null,
      photo_urls: photoUrls,
      linked_route: link.linked_route,
      linked_label: link.linked_label,
      linked_label_th: link.linked_label_th,
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

          {/* Station */}
          <div>
            <label className={LABEL}>Station</label>
            <div className="flex gap-1.5">
              {STATION_OPTIONS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStation(s.value)}
                  className={`flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                    station === s.value
                      ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
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
                <option value="monthly">Monthly</option>
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

          {recurrence === 'monthly' && (
            <div>
              <label className={LABEL}>Day of month</label>
              <input
                type="number"
                min={1}
                max={31}
                className={INPUT}
                value={days[0] ?? 1}
                onChange={(e) => {
                  const n = Math.min(31, Math.max(1, Math.round(Number(e.target.value) || 1)))
                  setDays([n])
                }}
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Days 29–31 run on the last day in shorter months.
              </p>
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

          {/* Deep link */}
          <TaskLinkPicker value={link} station={station} onChange={setLink} />

          {/* Photo report */}
          <div>
            <label className={LABEL}>
              <Camera className="mr-1 inline h-3 w-3" />
              Photo report (optional)
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {photoUrls.map((url) => (
                <div key={url} className="relative h-16 w-16 overflow-hidden rounded-lg border border-slate-700">
                  <img src={url} alt="report" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setPhotoUrls((prev) => prev.filter((u) => u !== url))}
                    className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white/80 hover:bg-black/80"
                    title="Remove"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={isUploading}
                className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-700 text-slate-500 transition hover:border-emerald-500/40 hover:text-emerald-400 disabled:cursor-wait"
              >
                {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                <span className="text-[9px]">{isUploading ? '…' : 'Add'}</span>
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              onChange={onPickFiles}
              className="hidden"
            />
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
