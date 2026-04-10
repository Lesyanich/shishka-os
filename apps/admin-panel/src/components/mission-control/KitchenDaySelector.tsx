// ── Types ────────────────────────────────────────────────────────────────────

export interface DayInfo {
  date: Date
  taskCount: number
}

export interface KitchenDaySelectorProps {
  days: DayInfo[]
  selectedDate: string  // YYYY-MM-DD
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
                ? 'border-orange-500/25 bg-orange-500/10 text-orange-400'
                : 'border-slate-800/60 bg-slate-900/40 text-slate-400 hover:border-slate-700/60 hover:text-slate-300',
            ].join(' ')}
          >
            {/* Day name */}
            <span className="text-[10px] font-semibold uppercase tracking-widest">
              {SHORT_DAY_NAMES[date.getDay()]}
            </span>

            {/* Date number */}
            <span className={[
              'text-base font-bold leading-none',
              isSelected ? 'text-orange-300' : 'text-slate-200',
            ].join(' ')}>
              {date.getDate()}
            </span>

            {/* Task count badge */}
            <span className={[
              'rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none',
              isSelected
                ? 'bg-orange-500/20 text-orange-300'
                : 'bg-slate-800/80 text-slate-500',
            ].join(' ')}>
              {taskCount}
            </span>

            {/* Today dot */}
            {isToday && (
              <span className="absolute bottom-1.5 h-1 w-1 rounded-full bg-orange-400" />
            )}
          </button>
        )
      })}
    </div>
  )
}
