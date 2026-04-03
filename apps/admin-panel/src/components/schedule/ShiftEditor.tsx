import { useState, useEffect } from 'react'
import { X, Trash2 } from 'lucide-react'
import type { Staff } from '../../hooks/useStaff'
import type { Shift, ShiftInsert } from '../../hooks/useShifts'
import type { Equipment } from '../../hooks/useEquipment'
import { ShiftTaskEditor, type ShiftTaskDraft } from './ShiftTaskEditor'
import { EquipmentAllocation } from './EquipmentAllocation'
import { supabase } from '../../lib/supabase'

const STATUS_OPTIONS: { value: Shift['status']; label: string }[] = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'no_show', label: 'No Show' },
]

interface ShiftEditorProps {
  shift?: Shift | null
  date: string
  staffList: Staff[]
  equipment: Equipment[]
  onSave: (data: ShiftInsert, tasks: ShiftTaskDraft[]) => Promise<void>
  onDelete?: (id: string) => Promise<void>
  onClose: () => void
}

export function ShiftEditor({ shift, date, staffList, equipment, onSave, onDelete, onClose }: ShiftEditorProps) {
  const isEdit = !!shift
  const [staffId, setStaffId] = useState(shift?.staff_id ?? (staffList[0]?.id ?? ''))
  const [shiftDate, setShiftDate] = useState(shift?.shift_date ?? date)
  const [startTime, setStartTime] = useState(shift?.start_time?.slice(0, 5) ?? '08:00')
  const [endTime, setEndTime] = useState(shift?.end_time?.slice(0, 5) ?? '16:00')
  const [breakMin, setBreakMin] = useState(shift?.break_minutes ?? 0)
  const [status, setStatus] = useState<Shift['status']>(shift?.status ?? 'scheduled')
  const [notes, setNotes] = useState(shift?.notes ?? '')
  const [tasks, setTasks] = useState<ShiftTaskDraft[]>([])
  const [saving, setSaving] = useState(false)

  // Load existing tasks when editing
  useEffect(() => {
    if (!shift) return
    supabase
      .from('shift_tasks')
      .select('id, task_description, start_time, end_time, equipment_id, priority')
      .eq('shift_id', shift.id)
      .order('start_time', { ascending: true })
      .then(({ data }) => {
        if (data) {
          setTasks(
            data.map((t: Record<string, unknown>) => ({
              id: t.id as string,
              task_description: (t.task_description as string) ?? '',
              start_time: (t.start_time as string)?.slice(0, 5) ?? startTime,
              end_time: (t.end_time as string)?.slice(0, 5) ?? endTime,
              equipment_id: (t.equipment_id as string) ?? null,
              priority: (t.priority as number) ?? 0,
            })),
          )
        }
      })
  }, [shift, startTime, endTime])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!staffId) return

    setSaving(true)
    await onSave(
      {
        staff_id: staffId,
        shift_date: shiftDate,
        start_time: startTime,
        end_time: endTime,
        break_minutes: breakMin,
        status,
        notes: notes.trim() || null,
      },
      tasks,
    )
    setSaving(false)
    onClose()
  }

  async function handleDelete() {
    if (!shift || !onDelete) return
    if (!confirm('Delete shift?')) return
    setSaving(true)
    await onDelete(shift.id)
    setSaving(false)
    onClose()
  }

  const activeStaff = staffList.filter((s) => s.is_active)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-12">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-100">
            {isEdit ? 'Edit Shift' : 'New Shift'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          {/* Staff */}
          <div>
            <label className="mb-1 block text-xs text-slate-400">Staff Member *</label>
            <select
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
            >
              <option value="">— select —</option>
              {activeStaff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div>
            <label className="mb-1 block text-xs text-slate-400">Date</label>
            <input
              type="date"
              value={shiftDate}
              onChange={(e) => setShiftDate(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Time */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-slate-400">Start</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs text-slate-400">End</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div className="w-20">
              <label className="mb-1 block text-xs text-slate-400">Break</label>
              <input
                type="number"
                min={0}
                value={breakMin}
                onChange={(e) => setBreakMin(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Status */}
          {isEdit && (
            <div>
              <label className="mb-1 block text-xs text-slate-400">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Shift['status'])}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="mb-1 block text-xs text-slate-400">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
              placeholder="Shift notes..."
            />
          </div>

          {/* Tasks */}
          <ShiftTaskEditor
            tasks={tasks}
            onChange={setTasks}
            equipment={equipment}
            shiftStart={startTime}
            shiftEnd={endTime}
          />

          {/* Equipment allocation preview */}
          <EquipmentAllocation
            tasks={tasks}
            equipment={equipment}
            shiftStart={startTime}
            shiftEnd={endTime}
          />
        </div>

        {/* Actions */}
        <div className="mt-5 flex gap-2">
          {isEdit && onDelete && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-sm text-rose-400 hover:bg-rose-500/10 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !staffId}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {saving ? 'Saving...' : isEdit ? 'Save' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  )
}
