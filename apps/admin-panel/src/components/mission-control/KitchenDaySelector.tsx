// ── Types ────────────────────────────────────────────────────────────────────

export interface DayInfo {
  date: Date
  taskCount: number
}

export interface KitchenDaySelectorProps {
  days: DayInfo[]
  selectedDate: string // YYYY-MM-DD
  onSelect: (dateStr: string) => void
  todayStr: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const SHORT_DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function toDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// ── Component ────────────────────────────────────────────────────────────────

export function KitchenDaySelector({
  days,
  selectedDate,
  onSelect,
  todayStr,
}: KitchenDaySelectorProps) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {days.map(({ date, taskCount }) => {
        const dateStr = toDateStr(date)
        const isSelected = dateStr === selectedDate
        const isToday = dateStr === todayStr

        return (
          <button
            key={dateStr}
            type="button"
            onClick={() => onSelect(dateStr)}
            className={[
              'relative flex flex-col items-center gap-0.5 rounded-xl border px-3 py-2',
              'min-w-[64px] flex-shrink-0 transition-colors duration-150',
              isSelected
                ? 'border-amber-watch/25 bg-amber-watch/10 text-amber-watch'
                : 'border-[var(--line)] bg-[var(--s-1)] text-cream/60 hover:border-[var(--line-strong)] hover:text-cream/80',
            ].join(' ')}
          >
            {/* Day name */}
            <span className="text-[10px] font-semibold uppercase tracking-widest">
              {SHORT_DAY_NAMES[date.getDay()]}
            </span>

            {/* Date number */}
            <span
              className={[
                'text-base font-bold leading-none',
                isSelected ? 'text-amber-watch' : 'text-cream',
              ].join(' ')}
            >
              {date.getDate()}
            </span>

            {/* Task count badge */}
            <span
              className={[
                'rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none',
                isSelected ? 'bg-amber-watch/20 text-amber-watch' : 'bg-[var(--s-2)] text-cream/45',
              ].join(' ')}
            >
              {taskCount}
            </span>

            {/* Today dot */}
            {isToday && (
              <span className="absolute bottom-1.5 h-1 w-1 rounded-full bg-amber-watch" />
            )}
          </button>
        )
      })}
    </div>
  )
}
