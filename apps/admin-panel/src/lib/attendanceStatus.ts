// Presentation for staff_attendance.status when overlaid on the schedule grids.
// The canonical status list + owner-facing colors live in AttendancePage; this
// module is the read-side vocabulary the schedule views share so a day-off /
// absence marked in /hr/attendance shows up on /schedule and /staff/schedule.

export interface AttendanceMeta {
  /** Full human label, e.g. for tooltips. */
  label: string
  /** Compact label for a grid cell badge. */
  short: string
  /** Tailwind classes for the badge pill. */
  badge: string
}

const META: Record<string, AttendanceMeta> = {
  worked: { label: 'Worked', short: 'Worked', badge: 'bg-emerald-500/20 text-emerald-300' },
  absent: { label: 'Absent', short: 'Absent', badge: 'bg-red-500/20 text-red-300 border border-red-500/40' },
  sick_leave: { label: 'Sick leave', short: 'Sick', badge: 'bg-amber-500/20 text-amber-300 border border-amber-500/40' },
  annual_leave: { label: 'Annual leave', short: 'Annual', badge: 'bg-sky-500/20 text-sky-300 border border-sky-500/40' },
  personal_leave: { label: 'Personal leave', short: 'Personal', badge: 'bg-sky-500/20 text-sky-300 border border-sky-500/40' },
  maternity_leave: { label: 'Maternity leave', short: 'Maternity', badge: 'bg-pink-500/20 text-pink-300 border border-pink-500/40' },
  paternity_leave: { label: 'Paternity leave', short: 'Paternity', badge: 'bg-pink-500/20 text-pink-300 border border-pink-500/40' },
  holiday: { label: 'Public holiday', short: 'Holiday', badge: 'bg-violet-500/20 text-violet-300 border border-violet-500/40' },
  day_off: { label: 'Day off', short: 'Off', badge: 'bg-slate-700 text-slate-400 border border-slate-600' },
}

/** Generic non-working badge for colleague rows on the staff-facing page. */
const GENERIC_OFF: AttendanceMeta = {
  label: 'Off',
  short: 'Off',
  badge: 'bg-slate-700 text-slate-400 border border-slate-600',
}

export function attendanceMeta(status: string | null | undefined): AttendanceMeta | null {
  if (!status) return null
  return META[status] ?? null
}

/** Colleague-facing variant: hides the specific leave reason (privacy), keeps "Off". */
export function attendanceMetaGeneric(status: string | null | undefined): AttendanceMeta | null {
  if (!status || status === 'worked') return null
  return GENERIC_OFF
}

/**
 * A day the person is NOT working — overrides a scheduled shift on the grid.
 * 'worked' (and absence of any record) means the shift stands as planned.
 */
export function isNonWorkingStatus(status: string | null | undefined): boolean {
  return !!status && status !== 'worked'
}
