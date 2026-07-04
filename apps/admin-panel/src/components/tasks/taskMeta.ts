// Shared labels, badge styles, and small helpers for the staff task tracker.
// Storage is English (per Language Contract); Thai labels are for the bilingual
// surfaces (admin preview + Telegram pushes in Phase 2).

import type { LucideIcon } from 'lucide-react'
import {
  DoorOpen, DoorClosed, ChefHat, Sparkles, ClipboardList, Tag,
  PackageCheck, Trash2, Wrench, ShieldCheck, Sunrise, Sun, Sunset, Clock,
} from 'lucide-react'
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
  { value: 'stock_check', label: 'Stock check', label_th: 'เช็คสต๊อก' },
  { value: 'food_safety', label: 'Food safety', label_th: 'ความปลอดภัยอาหาร' },
  { value: 'equipment', label: 'Equipment', label_th: 'อุปกรณ์' },
  { value: 'waste', label: 'Write-off', label_th: 'ตัดทิ้ง' },
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
  stock_check: 'bg-lime-500/15 text-lime-300',
  food_safety: 'bg-red-500/15 text-red-300',
  equipment: 'bg-orange-500/15 text-orange-300',
  waste: 'bg-rose-500/15 text-rose-300',
  admin: 'bg-slate-500/15 text-slate-300',
  general: 'bg-slate-700/40 text-slate-300',
}

/** Per-category icon — used for the card's work-type chip & accent. */
export const CATEGORY_ICON: Record<TaskCategory, LucideIcon> = {
  opening: DoorOpen,
  closing: DoorClosed,
  prep: ChefHat,
  cleaning: Sparkles,
  stock_check: PackageCheck,
  food_safety: ShieldCheck,
  equipment: Wrench,
  waste: Trash2,
  admin: ClipboardList,
  general: Tag,
}

/**
 * Icon for a category, with a safe fallback. A category is a component (not a
 * string), so an unknown value (the DB check constraint can add a category the
 * frontend map hasn't caught up to yet) would render `<undefined/>` and crash
 * the whole board with React #130. Fall back to the neutral Tag icon instead.
 */
export function categoryIcon(category: string): LucideIcon {
  return CATEGORY_ICON[category as TaskCategory] ?? Tag
}

/** Left-border accent class per category — the card's at-a-glance work-type stripe. */
export const CATEGORY_ACCENT: Record<TaskCategory, string> = {
  opening: 'border-l-sky-500/60',
  closing: 'border-l-violet-500/60',
  prep: 'border-l-amber-500/60',
  cleaning: 'border-l-teal-500/60',
  stock_check: 'border-l-lime-500/60',
  food_safety: 'border-l-red-500/60',
  equipment: 'border-l-orange-500/60',
  waste: 'border-l-rose-500/60',
  admin: 'border-l-slate-500/60',
  general: 'border-l-slate-700',
}

/** Clustering order so same-type work sits together inside a time-of-day section. */
export const CATEGORY_SORT: Record<TaskCategory, number> = {
  opening: 0,
  prep: 1,
  stock_check: 2,
  food_safety: 3,
  cleaning: 4,
  equipment: 5,
  waste: 6,
  admin: 7,
  closing: 8,
  general: 9,
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

// ── Time-of-day bands ──────────────────────────────────────────────────────
// Today's tasks are sectioned by when they're due. Thresholds chosen against
// shifts 08:00–17:00 / close 18:00 — easily tweakable. Tasks with no due_time
// fall into "Anytime".
export type TimeBand = 'morning' | 'day' | 'evening' | 'anytime'

export const TIME_BANDS: {
  key: TimeBand
  label: string
  label_th: string
  icon: LucideIcon
}[] = [
  { key: 'morning', label: 'Morning', label_th: 'ช่วงเช้า', icon: Sunrise },
  { key: 'day', label: 'Day', label_th: 'ช่วงกลางวัน', icon: Sun },
  { key: 'evening', label: 'Evening', label_th: 'ช่วงเย็น', icon: Sunset },
  { key: 'anytime', label: 'Anytime', label_th: 'ไม่ระบุเวลา', icon: Clock },
]

/** Bucket a task into a time-of-day band from its `due_time` (HH:MM[:SS]). */
export function timeBandOf(task: Pick<StaffTask, 'due_time'>): TimeBand {
  if (!task.due_time) return 'anytime'
  const hhmm = task.due_time.slice(0, 5)
  if (hhmm < '11:00') return 'morning'
  if (hhmm < '16:00') return 'day'
  return 'evening'
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
