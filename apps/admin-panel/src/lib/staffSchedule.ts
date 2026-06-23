// Pure helpers for the cook-facing Staff schedule + shift clock-in/out page.
// Kept free of React/Supabase so the logic is unit-testable in isolation.

export interface ClockEvent {
  id: string
  staff_id: string
  shift_id: string | null
  event_type: 'clock_in' | 'clock_out'
  event_at: string
  source: string
  note: string | null
  created_at: string
}

export interface ClockStatus {
  isClockedIn: boolean
  lastEvent: ClockEvent | null
}

/**
 * Derive clocked-in state from a day's punch list.
 * Expects `events` ordered ascending by event_at; the latest punch wins,
 * so clock_in → on shift, clock_out → off shift.
 */
export function deriveClockStatus(events: ClockEvent[]): ClockStatus {
  if (events.length === 0) return { isClockedIn: false, lastEvent: null }
  const lastEvent = events[events.length - 1]
  return { isClockedIn: lastEvent.event_type === 'clock_in', lastEvent }
}

export interface WeekDay {
  iso: string // YYYY-MM-DD (local)
  label: string // Mon, Tue, ...
  dayNum: number // day of month
  isToday: boolean
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

/** Local date as YYYY-MM-DD — matches the `date` type of shifts.shift_date. */
export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** The Monday-anchored 7-day window that contains `refDate` (local time). */
export function getWeekDays(refDate: Date): WeekDay[] {
  const monday = new Date(refDate)
  const mondayOffset = (monday.getDay() + 6) % 7 // Sun=0 → 6, Mon=1 → 0
  monday.setDate(monday.getDate() - mondayOffset)
  monday.setHours(0, 0, 0, 0)

  const todayIso = toISODate(new Date())
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const iso = toISODate(d)
    return { iso, label: DAY_LABELS[i], dayNum: d.getDate(), isToday: iso === todayIso }
  })
}

/** Trim a 'HH:MM:SS' time column (or ISO timestamp) down to 'HH:MM'. */
export function formatTime(t: string | null): string {
  if (!t) return ''
  if (/^\d{2}:\d{2}/.test(t)) return t.slice(0, 5)
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

interface ShiftLike {
  staff_id: string
  shift_date: string
  start_time: string
  end_time: string
}

/** Find a staff member's shift on a given ISO day, or null if they're off. */
export function shiftFor<T extends ShiftLike>(shifts: T[], staffId: string, dayIso: string): T | null {
  return shifts.find((s) => s.staff_id === staffId && s.shift_date === dayIso) ?? null
}
