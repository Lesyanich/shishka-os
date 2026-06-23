// Shared labels, badge styles, and small helpers for the staff task tracker.
// Storage is English (per Language Contract); Thai labels are for the bilingual
// surfaces (admin preview + Telegram pushes in Phase 2).

import type {
  StaffTask,
  TaskCategory,
  TaskPriority,
  TaskStation,
  TaskStatus,
} from '../../hooks/useStaffTasks'

export interface CategoryOption {
  value: TaskCategory
  label: string
  label_th: string
}

export const CATEGORY_OPTIONS: CategoryOption[] = [
  { value: 'opening', label: 'Opening', label_th: 'เปิดร้าน' },
  { value: 'closing', label: 'Closing', label_th: 'ปิดร้าน' },
  { value: 'prep', label: 'Prep', label_th: 'เตรียมของ' },
  { value: 'cleaning', label: 'Cleaning', label_th: 'ทำความสะอาด' },
  { value: 'admin', label: 'Admin', label_th: 'งานเอกสาร' },
  { value: 'general', label: 'General', label_th: 'ทั่วไป' },
]

export const CATEGORY_LABEL: Record<TaskCategory, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map((c) => [c.value, c.label]),
) as Record<TaskCategory, string>

export const CATEGORY_STYLE: Record<TaskCategory, string> = {
  opening: 'bg-sky-500/15 text-sky-300',
  closing: 'bg-violet-500/15 text-violet-300',
  prep: 'bg-amber-500/15 text-amber-300',
  cleaning: 'bg-teal-500/15 text-teal-300',
  admin: 'bg-slate-500/15 text-slate-300',
  general: 'bg-slate-700/40 text-slate-300',
}

export interface PriorityOption {
  value: TaskPriority
  label: string
}

export const PRIORITY_OPTIONS: PriorityOption[] = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

export const PRIORITY_DOT: Record<TaskPriority, string> = {
  critical: 'bg-rose-500',
  high: 'bg-amber-500',
  medium: 'bg-sky-500',
  low: 'bg-slate-500',
}

// Station: L1 = prep kitchen, L2 = assembly/service, general = both.
export interface StationOption {
  value: TaskStation
  label: string
  label_th: string
}

export const STATION_OPTIONS: StationOption[] = [
  { value: 'general', label: 'General', label_th: 'ทั่วไป' },
  { value: 'L1', label: 'L1 Kitchen', label_th: 'L1 ครัว' },
  { value: 'L2', label: 'L2 Assembly', label_th: 'L2 ประกอบ' },
]

export const STATION_LABEL: Record<TaskStation, string> = Object.fromEntries(
  STATION_OPTIONS.map((s) => [s.value, s.label]),
) as Record<TaskStation, string>

export const STATION_STYLE: Record<TaskStation, string> = {
  L1: 'bg-orange-500/15 text-orange-300',
  L2: 'bg-cyan-500/15 text-cyan-300',
  general: 'bg-slate-700/40 text-slate-300',
}

export const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'cancelled', label: 'Cancelled' },
]

export const STATUS_LABEL: Record<TaskStatus, string> = Object.fromEntries(
  STATUS_OPTIONS.map((s) => [s.value, s.label]),
) as Record<TaskStatus, string>

export const STATUS_STYLE: Record<TaskStatus, string> = {
  todo: 'bg-slate-700/40 text-slate-300',
  in_progress: 'bg-sky-500/15 text-sky-300',
  done: 'bg-emerald-500/15 text-emerald-300',
  skipped: 'bg-amber-500/15 text-amber-300',
  cancelled: 'bg-slate-800 text-slate-500',
}

// Postgres dow: 0=Sunday .. 6=Saturday. Order shown Mon-first for UX.
export const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
]

/** Local-timezone YYYY-MM-DD (Asia/Bangkok on the shop's machines). */
export function formatLocalDate(d: Date): string {
  return d.toLocaleDateString('en-CA') // en-CA renders as ISO YYYY-MM-DD
}

/** "HH:MM" from a "HH:MM:SS" time string. */
export function shortTime(t: string | null): string {
  if (!t) return ''
  return t.slice(0, 5)
}

export function describeRecurrence(task: Pick<StaffTask, 'recurrence' | 'recurrence_days'>): string {
  if (task.recurrence === 'daily') return 'Every day'
  if (task.recurrence === 'weekly') {
    const days = (task.recurrence_days ?? [])
      .slice()
      .sort((a, b) => a - b)
      .map((d) => WEEKDAYS.find((w) => w.value === d)?.label ?? '')
      .filter(Boolean)
    return days.length ? `Weekly · ${days.join(', ')}` : 'Weekly'
  }
  if (task.recurrence === 'monthly') {
    // For monthly, recurrence_days holds the day-of-month (1–31).
    const day = task.recurrence_days?.[0]
    return day ? `Monthly · day ${day}` : 'Monthly'
  }
  return 'One-off'
}

/** A concrete (non-template) task whose due moment is in the past and not finished. */
export function isOverdue(task: StaffTask, now: Date = new Date()): boolean {
  if (task.is_template) return false
  if (task.status === 'done' || task.status === 'cancelled' || task.status === 'skipped') return false
  if (!task.due_date) return false
  const due = new Date(`${task.due_date}T${task.due_time ?? '23:59'}:00`)
  return due.getTime() < now.getTime()
}
