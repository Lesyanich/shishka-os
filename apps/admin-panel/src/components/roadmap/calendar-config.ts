/**
 * Calendar ribbon config for the Opening Roadmap.
 *
 * Positions are percent-of-timeline offsets, anchored on Today at 0% and
 * Soft Opening at 100%. v1 keeps the ribbon visually stable at today's
 * snapshot; recomputing positions from real dates is a v2 upgrade (SPEC §11).
 */

export type CalendarMarkerKind = 'today' | 'lock' | 'test' | 'soft'

export interface CalendarTick {
  /** Calendar label, e.g. "Apr 24". */
  label: string
  /** Whether this tick is a major gridline (longer). */
  major: boolean
}

export interface CalendarMarker {
  kind: CalendarMarkerKind
  label: string
  date: string // human-readable short date
  /** 0–100, percent along the ribbon. */
  position: number
}

export const CALENDAR_TICKS: readonly CalendarTick[] = [
  { label: 'Apr 24', major: true },
  { label: '', major: false },
  { label: 'Apr 28', major: true },
  { label: '', major: false },
  { label: 'May 05', major: true },
  { label: '', major: false },
  { label: 'May 12', major: true },
  { label: '', major: false },
  { label: 'May 22', major: true },
  { label: '', major: false },
  { label: 'Jun 05', major: true },
] as const

export const CALENDAR_MARKERS: readonly CalendarMarker[] = [
  { kind: 'today', label: 'Today', date: 'Fri 24 Apr', position: 0 },
  { kind: 'lock', label: 'Recipe Lock', date: 'Tue 28 Apr', position: 20 },
  { kind: 'test', label: 'Test Batch 1', date: 'Tue 12 May', position: 45 },
  { kind: 'test', label: 'Dry-run Service', date: 'Fri 22 May', position: 70 },
  { kind: 'soft', label: 'Soft Opening', date: 'Fri 05 Jun', position: 100 },
] as const
