// Pure helpers for the HR punctuality dashboard (policy LEG-004).
// Kept free of React/Supabase so the aggregation is unit-testable in isolation.

export type PunchStatus = 'on_time' | 'late' | 'pending' | 'no_clock_in'

/** One row of `v_shift_punctuality` (see migration 366). */
export interface PunctualityRow {
  shift_id: string
  staff_id: string
  shift_date: string
  start_time: string
  end_time: string
  first_in_at: string | null
  first_in_local: string | null
  grace_min: number
  punch_status: PunchStatus
  late_minutes: number
}

export interface StaffPunctuality {
  staffId: string
  onTimeCount: number
  lateCount: number
  lateMinutesTotal: number
  noClockInDays: number
  /** Shifts already past their grace window (excludes 'pending'). */
  settledShifts: number
  incidents: PunctualityRow[]
}

export const PUNCH_STATUS_META: Record<
  PunchStatus,
  { label: string; color: string; dot: string }
> = {
  on_time: {
    label: 'On time',
    color: 'bg-emerald-500/20 text-emerald-300',
    dot: 'bg-emerald-400',
  },
  late: { label: 'Late', color: 'bg-amber-500/20 text-amber-300', dot: 'bg-amber-400' },
  pending: {
    label: 'Not started',
    color: 'bg-slate-700/60 text-slate-400',
    dot: 'bg-slate-500',
  },
  no_clock_in: {
    label: 'No clock-in',
    color: 'bg-rose-500/20 text-rose-300',
    dot: 'bg-rose-400',
  },
}

export const WARNING_KIND_META: Record<
  WarningKind,
  { label: string; color: string }
> = {
  verbal: { label: 'Verbal', color: 'bg-slate-700 text-slate-300' },
  written_1: { label: 'Written #1', color: 'bg-amber-500/20 text-amber-300' },
  written_2_final: { label: 'Written #2 (final)', color: 'bg-rose-500/20 text-rose-300' },
}

export type WarningKind = 'verbal' | 'written_1' | 'written_2_final'

/** One row of `staff_warnings` (see migration 367). */
export interface StaffWarning {
  id: string
  staff_id: string
  kind: WarningKind
  issued_on: string
  expires_on: string
  reason: string
  doc_url: string | null
  notes: string | null
  issued_by: string | null
  created_at: string
}

/**
 * Aggregate raw punctuality rows into a per-staff summary.
 * 'pending' shifts (grace window not elapsed) are counted in neither the
 * on-time nor the no-clock-in buckets — they are simply not settled yet.
 * Incidents (late / no clock-in) are returned newest-first for drill-down.
 */
export function aggregateByStaff(rows: PunctualityRow[]): Map<string, StaffPunctuality> {
  const byStaff = new Map<string, StaffPunctuality>()

  for (const row of rows) {
    const entry: StaffPunctuality = byStaff.get(row.staff_id) ?? {
      staffId: row.staff_id,
      onTimeCount: 0,
      lateCount: 0,
      lateMinutesTotal: 0,
      noClockInDays: 0,
      settledShifts: 0,
      incidents: [],
    }

    if (row.punch_status !== 'pending') entry.settledShifts += 1

    if (row.punch_status === 'on_time') {
      entry.onTimeCount += 1
    } else if (row.punch_status === 'late') {
      entry.lateCount += 1
      entry.lateMinutesTotal += row.late_minutes
      entry.incidents.push(row)
    } else if (row.punch_status === 'no_clock_in') {
      entry.noClockInDays += 1
      entry.incidents.push(row)
    }

    byStaff.set(row.staff_id, entry)
  }

  for (const entry of byStaff.values()) {
    entry.incidents.sort((a, b) => b.shift_date.localeCompare(a.shift_date))
  }

  return byStaff
}

/**
 * Late-count delta vs the previous month, per staff.
 * Positive = more lateness than last month (getting worse).
 */
export function lateTrend(
  current: Map<string, StaffPunctuality>,
  previous: Map<string, StaffPunctuality>,
  staffId: string,
): number {
  return (current.get(staffId)?.lateCount ?? 0) - (previous.get(staffId)?.lateCount ?? 0)
}

/** Warnings still within their 1-year §119(4) validity window, newest first. */
export function activeWarnings(warnings: StaffWarning[], todayIso: string): StaffWarning[] {
  return warnings
    .filter((w) => w.expires_on >= todayIso)
    .sort((a, b) => b.issued_on.localeCompare(a.issued_on))
}

/** Highest-severity active warning per staff — drives the roster badge. */
export function strongestActiveWarning(
  warnings: StaffWarning[],
  todayIso: string,
): StaffWarning | null {
  const rank: Record<WarningKind, number> = { verbal: 1, written_1: 2, written_2_final: 3 }
  let strongest: StaffWarning | null = null
  for (const w of activeWarnings(warnings, todayIso)) {
    if (!strongest || rank[w.kind] > rank[strongest.kind]) strongest = w
  }
  return strongest
}

/**
 * Value of unworked time per LEG-004 §3: monthly_salary / 30 days / 9 hours,
 * pro-rated per minute. Informational only — never applied automatically by
 * payroll (`fn_calculate_payroll` deducts full `absent` days only).
 */
export function unworkedTimeValue(monthlySalary: number, lateMinutes: number): number {
  if (monthlySalary <= 0 || lateMinutes <= 0) return 0
  return (monthlySalary / 30 / 9 / 60) * lateMinutes
}

/** '25' → '25 min'; '95' → '1h 35m'. */
export function formatMinutes(mins: number): string {
  if (mins <= 0) return '—'
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}
