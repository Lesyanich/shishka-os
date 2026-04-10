import { useState } from 'react'
import type { ReactNode } from 'react'
import { UtensilsCrossed, Timer, Coffee, Trash2, Package } from 'lucide-react'
import type { BusinessTask } from '../../hooks/useBusinessTasks'
import { KitchenDaySelector } from './KitchenDaySelector'
import type { DayInfo } from './KitchenDaySelector'
import { KitchenTaskCard } from './KitchenTaskCard'

// ── Types ─────────────────────────────────────────────────────────────────────

type Category = 'prep' | 'service' | 'cleaning' | 'order'

interface SectionConfig {
  id: Category
  label: string
  timeRange: string
  color: string          // text color class
  iconColor: string      // icon color class
  icon: ReactNode
}

// ── Section config ────────────────────────────────────────────────────────────

const SECTIONS: SectionConfig[] = [
  {
    id:        'prep',
    label:     'Prep',
    timeRange: '07:00 – 10:00',
    color:     'text-orange-400',
    iconColor: 'text-orange-400',
    icon:      <Timer className="h-4 w-4" />,
  },
  {
    id:        'service',
    label:     'Service',
    timeRange: '10:00 – 18:00',
    color:     'text-emerald-400',
    iconColor: 'text-emerald-400',
    icon:      <Coffee className="h-4 w-4" />,
  },
  {
    id:        'cleaning',
    label:     'Closing',
    timeRange: '18:00 – 19:00',
    color:     'text-blue-400',
    iconColor: 'text-blue-400',
    icon:      <Trash2 className="h-4 w-4" />,
  },
  {
    id:        'order',
    label:     'Orders',
    timeRange: '',
    color:     'text-violet-400',
    iconColor: 'text-violet-400',
    icon:      <Package className="h-4 w-4" />,
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getTodayStr(): string {
  return toDateStr(new Date())
}

function buildDays(todayStr: string, allTasks: BusinessTask[]): DayInfo[] {
  // yesterday + today + 5 days ahead = 7 total
  const today = new Date(todayStr + 'T00:00:00')
  const days: DayInfo[] = []

  for (let offset = -1; offset <= 5; offset++) {
    const d = new Date(today)
    d.setDate(today.getDate() + offset)
    const ds = toDateStr(d)

    const taskCount = allTasks.filter(t => {
      if (!t.due_date) return false
      return t.due_date.startsWith(ds)
    }).length

    days.push({ date: d, taskCount })
  }

  return days
}

function detectCategory(tags: string[]): Category | null {
  const lower = tags.map(t => t.toLowerCase())
  if (lower.includes('prep'))     return 'prep'
  if (lower.includes('service'))  return 'service'
  if (lower.includes('cleaning')) return 'cleaning'
  if (lower.includes('order'))    return 'order'
  return null
}

function formatDateLabel(dateStr: string, todayStr: string): string {
  if (dateStr === todayStr) {
    const d = new Date(dateStr + 'T00:00:00')
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' })
    const monthDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return `Today — ${dayName}, ${monthDay}`
  }
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface KitchenSegmentProps {
  tasks: BusinessTask[]
  onOpenDetail: (task: BusinessTask) => void
}

// ── Component ────────────────────────────────────────────────────────────────

export function KitchenSegment({ tasks, onOpenDetail }: KitchenSegmentProps) {
  const todayStr = getTodayStr()
  const [selectedDate, setSelectedDate] = useState(todayStr)

  // Filter to kitchen human tasks only
  const kitchenTasks = tasks.filter(
    t => t.domain === 'kitchen' && t.executor_type === 'human'
  )

  // Build day strip
  const days = buildDays(todayStr, kitchenTasks)

  // Filter by selected date
  const dayTasks = kitchenTasks.filter(
    t => t.due_date && t.due_date.startsWith(selectedDate)
  )

  const dateLabel = formatDateLabel(selectedDate, todayStr)

  return (
    <section className="flex flex-col gap-4">
      {/* ── Day selector ──────────────────────────────────────────────────── */}
      <KitchenDaySelector
        days={days}
        selectedDate={selectedDate}
        onSelect={setSelectedDate}
        todayStr={todayStr}
      />

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <UtensilsCrossed className="h-4 w-4 text-orange-400" />
        <span className="text-sm font-semibold text-slate-200">{dateLabel}</span>
        <span className="ml-1 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
          {dayTasks.length}
        </span>
      </div>

      {/* ── Sections ──────────────────────────────────────────────────────── */}
      {SECTIONS.map(section => {
        const sectionTasks = dayTasks.filter(
          t => detectCategory(t.tags) === section.id
        )

        return (
          <div key={section.id} className="flex flex-col gap-2">
            {/* Section divider */}
            <div className="flex items-center gap-2">
              <span className={section.iconColor}>{section.icon}</span>
              <span className={`text-xs font-semibold ${section.color}`}>
                {section.label}
              </span>
              {section.timeRange && (
                <span className="text-[10px] text-slate-500">{section.timeRange}</span>
              )}
              <span className="ml-1 rounded-full bg-slate-800/60 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">
                {sectionTasks.length}
              </span>
              {/* Divider line */}
              <div className="flex-1 h-px bg-slate-800/60" />
            </div>

            {/* Task grid */}
            {sectionTasks.length > 0 ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {sectionTasks.map(task => (
                  <KitchenTaskCard key={task.id} task={task} onClick={onOpenDetail} />
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-800/40 bg-slate-900/20 px-4 py-4">
                <p className="text-[11px] text-slate-600">No {section.label.toLowerCase()} tasks</p>
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}
