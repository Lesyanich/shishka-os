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
  /** Owner marked this shift excused — it leaves the counter and the pay total. */
  is_excused: boolean
  excuse_reason: string | null
  /** Employee had signed the policy by this date (LEG-004 §3). */
  is_enforced: boolean
}

export interface StaffPunctuality {
  staffId: string
  onTimeCount: number
  lateCount: number
  lateMinutesTotal: number
  noClockInDays: number
  /** Shifts already past their grace window (excludes 'pending'). */
  settledShifts: number
  /** Excused incidents — shown for the record, counted against nothing. */
  excusedCount: number
  /** Unenforceable incidents (before the employee signed) — facts, not grounds. */
  unenforcedCount: number
  /** Late + no-punch shifts, newest first; excused ones included but flagged. */
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

export type WarningStatus = 'approved' | 'dismissed'

/** One row of `staff_warnings` (see migrations 367 + 371). */
export interface StaffWarning {
  id: string
  staff_id: string
  kind: WarningKind
  status: WarningStatus
  issued_on: string
  expires_on: string
  /** Month a punctuality proposal was raised for; null = logged by hand. */
  for_period: string | null
  signed_on: string | null
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
      excusedCount: 0,
      unenforcedCount: 0,
      incidents: [],
    }

    if (row.punch_status !== 'pending') entry.settledShifts += 1

    if (row.punch_status === 'on_time') {
      entry.onTimeCount += 1
    } else if (row.punch_status === 'late' || row.punch_status === 'no_clock_in') {
      entry.incidents.push(row)
      // An excused shift stays visible in the drill-down but must not feed the
      // discipline counter or the unpaid-minutes total: issuing a warning over
      // an excused absence is what gets the whole ladder thrown out (LEG-004).
      // Same for anything before the employee signed the policy (§3) — those
      // are historical facts about a button nobody was asked to press yet.
      if (!row.is_enforced) {
        entry.unenforcedCount += 1
      } else if (row.is_excused) {
        entry.excusedCount += 1
      } else if (row.punch_status === 'late') {
        entry.lateCount += 1
        entry.lateMinutesTotal += row.late_minutes
      } else {
        entry.noClockInDays += 1
      }
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
    .filter((w) => w.status === 'approved' && w.expires_on >= todayIso)
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

/** One row of `v_warning_proposals` (see migration 371). */
export interface WarningProposal {
  staff_id: string
  period: string
  late_count: number
  no_punch_count: number
  late_minutes_total: number
  threshold: number
}

/**
 * The next rung of the LEG-004 §5 ladder for a staff member.
 * Verbal warnings carry no §119(4) weight but are the documented first step;
 * only live (approved, unexpired) warnings move the ladder along.
 */
export function nextWarningKind(activeWarnings: StaffWarning[]): WarningKind {
  const kinds = new Set(activeWarnings.map((w) => w.kind))
  if (kinds.has('written_2_final')) return 'written_2_final'
  if (kinds.has('written_1')) return 'written_2_final'
  if (kinds.has('verbal')) return 'written_1'
  return 'verbal'
}

/**
 * Value of unworked time per LEG-004 §3: monthly_salary / 30 days / 9 hours,
 * pro-rated per minute. This is a proposal, never an effect — it reaches a
 * payslip only once an owner approves it for that month
 * (`unworked_time_adjustments`, mig 372).
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
