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
  TaskPriority,
  TaskStation,
  TaskStatus,
} from '../../hooks/useStaffTasks'

export interface CategoryMeta {
  label: string
  label_th: string
  /** Work-type chip icon — also the card accent's visual anchor. */
  icon: LucideIcon
  /** Chip badge classes (bg + text). */
  style: string
  /** Left-border accent class — the card's at-a-glance work-type stripe. */
  accent: string
  /** Clustering order so same-type work sits together inside a time-of-day section. */
  sort: number
}

/**
 * Single source of truth for task categories. Adding a category = adding ONE
 * entry here (plus the DB migration widening staff_tasks_category_check —
 * taskMeta.test.ts asserts both stay in sync by parsing the migrations).
 * Key order = display order of the form dropdown & filter chips.
 */
export const CATEGORY_META = {
  opening: {
    label: 'Opening', label_th: 'เปิดร้าน', icon: DoorOpen,
    style: 'bg-sky-500/15 text-sky-300', accent: 'border-l-sky-500/60', sort: 0,
  },
  closing: {
    label: 'Closing', label_th: 'ปิดร้าน', icon: DoorClosed,
    style: 'bg-violet-500/15 text-violet-300', accent: 'border-l-violet-500/60', sort: 8,
  },
  prep: {
    label: 'Prep', label_th: 'เตรียมของ', icon: ChefHat,
    style: 'bg-amber-500/15 text-amber-300', accent: 'border-l-amber-500/60', sort: 1,
  },
  cleaning: {
    label: 'Cleaning', label_th: 'ทำความสะอาด', icon: Sparkles,
    style: 'bg-teal-500/15 text-teal-300', accent: 'border-l-teal-500/60', sort: 4,
  },
  stock_check: {
    label: 'Stock check', label_th: 'เช็คสต๊อก', icon: PackageCheck,
    style: 'bg-lime-500/15 text-lime-300', accent: 'border-l-lime-500/60', sort: 2,
  },
  food_safety: {
    label: 'Food safety', label_th: 'ความปลอดภัยอาหาร', icon: ShieldCheck,
    style: 'bg-red-500/15 text-red-300', accent: 'border-l-red-500/60', sort: 3,
  },
  equipment: {
    label: 'Equipment', label_th: 'อุปกรณ์', icon: Wrench,
    style: 'bg-orange-500/15 text-orange-300', accent: 'border-l-orange-500/60', sort: 5,
  },
  waste: {
    label: 'Write-off', label_th: 'ตัดทิ้ง', icon: Trash2,
    style: 'bg-rose-500/15 text-rose-300', accent: 'border-l-rose-500/60', sort: 6,
  },
  admin: {
    label: 'Admin', label_th: 'งานเอกสาร', icon: ClipboardList,
    style: 'bg-slate-500/15 text-slate-300', accent: 'border-l-slate-500/60', sort: 7,
  },
  general: {
    label: 'General', label_th: 'ทั่วไป', icon: Tag,
    style: 'bg-slate-700/40 text-slate-300', accent: 'border-l-slate-700', sort: 9,
  },
} as const satisfies Record<string, CategoryMeta>

/** Derived from CATEGORY_META — the hand-written union it replaces is what drifted in React #130. */
export type TaskCategory = keyof typeof CATEGORY_META

/** Every category the frontend knows, in display order. */
export const TASK_CATEGORIES = Object.keys(CATEGORY_META) as TaskCategory[]

export interface CategoryOption {
  value: TaskCategory
  label: string
  label_th: string
}

export const CATEGORY_OPTIONS: CategoryOption[] = TASK_CATEGORIES.map((value) => ({
  value,
  label: CATEGORY_META[value].label,
  label_th: CATEGORY_META[value].label_th,
}))

/**
 * Meta for a category, with a safe fallback. The icon is a component (not a
 * string), so an unknown value (the DB check constraint can add a category the
 * frontend hasn't caught up to yet) would render `<undefined/>` and crash the
 * whole board with React #130. Degrade to neutral styling with the raw value
 * as the label so the drift is visible instead of fatal.
 */
export function categoryMeta(category: string): CategoryMeta {
  const meta = CATEGORY_META[category as TaskCategory]
  if (meta) return meta
  if (import.meta.env.DEV) {
    console.warn(
      `[taskMeta] Unknown task category "${category}" — the DB check constraint is ahead of CATEGORY_META. Add one entry there and commit the migration.`,
    )
  }
  return { ...CATEGORY_META.general, label: category, label_th: '' }
}

/** Icon for a category — same safe fallback as categoryMeta. */
export function categoryIcon(category: string): LucideIcon {
  return categoryMeta(category).icon
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
