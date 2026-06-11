import { useState, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, X, Loader2, Sparkles } from 'lucide-react'
import {
  useAttendance,
  type AttendanceStatus,
} from '../../hooks/use-attendance'

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; color: string }[] = [
  { value: 'worked', label: 'Worked', color: 'bg-emerald-500/20 text-emerald-400' },
  { value: 'absent', label: 'Absent', color: 'bg-red-500/20 text-red-400' },
  { value: 'sick_leave', label: 'Sick', color: 'bg-amber-500/20 text-amber-400' },
  { value: 'annual_leave', label: 'Annual', color: 'bg-sky-500/20 text-sky-400' },
  { value: 'personal_leave', label: 'Personal', color: 'bg-sky-500/20 text-sky-300' },
  { value: 'holiday', label: 'Holiday', color: 'bg-violet-500/20 text-violet-400' },
  { value: 'day_off', label: 'Day Off', color: 'bg-slate-700 text-slate-500' },
]

const STATUS_COLOR: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.map((s) => [s.value, s.color]),
)

const STATUS_SHORT: Record<string, string> = {
  worked: 'W',
  absent: 'A',
  sick_leave: 'S',
  annual_leave: 'AL',
  personal_leave: 'PL',
  maternity_leave: 'ML',
  paternity_leave: 'PL',
  holiday: 'H',
  day_off: '-',
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function formatMonth(year: number, month: number): string {
  return new Date(year, month - 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

function getDayOfWeek(year: number, month: number, day: number): number {
  return new Date(year, month - 1, day).getDay()
}

function dateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

interface PopoverState {
  staffId: string
  date: string
  x: number
  y: number
}

export function AttendancePage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [popover, setPopover] = useState<PopoverState | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const { staff, attendance, holidays, closedWeekday, isLoading, upsertDay, removeDay, prefillMonth } =
    useAttendance(year, month)

  const [prefilling, setPrefilling] = useState(false)
  const [prefillResult, setPrefillResult] = useState<string | null>(null)

  const daysInMonth = getDaysInMonth(year, month)
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  const holidayDates = new Set(holidays.map((h) => h.holiday_date))

  function isClosedDay(day: number): boolean {
    return getDayOfWeek(year, month, day) === closedWeekday
  }

  async function handlePrefill() {
    setPrefilling(true)
    setPrefillResult(null)
    const created = await prefillMonth()
    setPrefillResult(`Filled ${created} days`)
    setPrefilling(false)
  }

  // Close popover on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopover(null)
      }
    }
    if (popover) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [popover])

  function prevMonth() {
    if (month === 1) {
      setYear(year - 1)
      setMonth(12)
    } else {
      setMonth(month - 1)
    }
    setPopover(null)
  }

  function nextMonth() {
    if (month === 12) {
      setYear(year + 1)
      setMonth(1)
    } else {
      setMonth(month + 1)
    }
    setPopover(null)
  }

  function getRecord(staffId: string, date: string) {
    return attendance.find(
      (r) => r.staff_id === staffId && r.attendance_date === date,
    )
  }

  function countWorked(staffId: string): number {
    return attendance.filter(
      (r) => r.staff_id === staffId && r.status === 'worked',
    ).length
  }

  function countWorkingDays(): number {
    let count = 0
    for (let d = 1; d <= daysInMonth; d++) {
      if (!isClosedDay(d) && !holidayDates.has(dateStr(year, month, d))) {
        count++
      }
    }
    return count
  }

  const workingDays = countWorkingDays()

  function handleCellClick(
    staffId: string,
    date: string,
    e: React.MouseEvent,
  ) {
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    setPopover({ staffId, date, x: rect.left, y: rect.bottom + 4 })
  }

  async function handleStatusSelect(status: AttendanceStatus) {
    if (!popover) return
    await upsertDay(popover.staffId, popover.date, status)
    setPopover(null)
  }

  async function handleClear() {
    if (!popover) return
    await removeDay(popover.staffId, popover.date)
    setPopover(null)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        Loading attendance...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Month selector */}
      <div className="flex items-center gap-3">
        <button
          onClick={prevMonth}
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-[160px] text-center text-sm font-semibold text-slate-200">
          {formatMonth(year, month)}
        </span>
        <button
          onClick={nextMonth}
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        <div className="flex-1" />

        <button
          onClick={handlePrefill}
          disabled={prefilling}
          className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-slate-100 disabled:opacity-50 transition"
          title="Fill this month from the schedule (worked / day-off / holiday); your manual edits are kept"
        >
          {prefilling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Pre-fill from schedule
        </button>
        {prefillResult && <span className="text-xs text-emerald-400">{prefillResult}</span>}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {STATUS_OPTIONS.map((s) => (
          <span key={s.value} className="flex items-center gap-1.5">
            <span className={`inline-block h-3 w-3 rounded-sm ${s.color}`} />
            <span className="text-slate-400">{s.label}</span>
          </span>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="overflow-x-auto rounded-lg ring-1 ring-slate-800">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-900/60">
              <th className="sticky left-0 z-10 bg-slate-900/95 px-3 py-2 text-left font-medium text-slate-400">
                Staff
              </th>
              {days.map((d) => {
                const date = dateStr(year, month, d)
                const closed = isClosedDay(d)
                const hol = holidayDates.has(date)
                return (
                  <th
                    key={d}
                    className={[
                      'min-w-[28px] px-0.5 py-2 text-center font-medium',
                      closed
                        ? 'text-red-400/60'
                        : hol
                          ? 'text-violet-400/60'
                          : 'text-slate-500',
                    ].join(' ')}
                  >
                    {d}
                  </th>
                )
              })}
              <th className="px-3 py-2 text-center font-medium text-slate-400">
                W/D
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {staff.map((s) => (
              <tr key={s.id} className="hover:bg-slate-900/30">
                <td className="sticky left-0 z-10 bg-slate-950/95 px-3 py-1.5 font-medium text-slate-300 whitespace-nowrap">
                  {s.name}
                </td>
                {days.map((d) => {
                  const date = dateStr(year, month, d)
                  const record = getRecord(s.id, date)
                  const closed = isClosedDay(d)
                  const hol = holidayDates.has(date)
                  const status = record?.status
                  const color = status ? STATUS_COLOR[status] : ''
                  const label = status ? STATUS_SHORT[status] ?? '?' : ''

                  return (
                    <td
                      key={d}
                      className={[
                        'px-0.5 py-1.5 text-center cursor-pointer transition-colors',
                        closed && !status ? 'bg-slate-900/40' : '',
                        hol && !status ? 'bg-violet-500/5' : '',
                      ].join(' ')}
                      onClick={(e) => handleCellClick(s.id, date, e)}
                    >
                      {status ? (
                        <span
                          className={`inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-semibold ${color}`}
                        >
                          {label}
                        </span>
                      ) : (
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded text-slate-700 hover:bg-slate-800 hover:text-slate-500">
                          ·
                        </span>
                      )}
                    </td>
                  )
                })}
                <td className="px-3 py-1.5 text-center text-slate-400 whitespace-nowrap">
                  <span className="text-emerald-400">{countWorked(s.id)}</span>
                  <span className="text-slate-600">/{workingDays}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Popover */}
      {popover && (
        <div
          ref={popoverRef}
          className="fixed z-50 rounded-lg bg-slate-800 p-2 shadow-xl ring-1 ring-slate-700"
          style={{ left: popover.x, top: popover.y }}
        >
          <div className="mb-1.5 flex items-center justify-between gap-4">
            <span className="text-xs font-medium text-slate-300">
              {popover.date}
            </span>
            <button
              onClick={handleClear}
              className="text-slate-500 hover:text-red-400 transition"
              title="Clear"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s.value}
                onClick={() => handleStatusSelect(s.value)}
                className={`rounded px-2 py-1 text-xs font-medium transition hover:opacity-80 ${s.color}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default AttendancePage
