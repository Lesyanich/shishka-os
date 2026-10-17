/* ═══════════════════════════════════════════════════════════════════
   Stock-variance thresholds — spec §6, in ONE place.

   The CEO deliberately left these open to retune after four weeks of
   real counts (spec §10, decision 2). They live here, alone, so that
   retuning is editing numbers rather than reading logic. Nothing else
   in the analytics code may hard-code a variance cut-off.

   Calibrated on prod 2026-10-16: the largest single item buys about
   THB 160 a week and the median A-item about THB 40, so an absolute
   weekly THB bar would never fire on its own — percent carries the
   signal and a small THB floor filters cheap-item noise.
   ═══════════════════════════════════════════════════════════════════ */

export const VARIANCE_THRESHOLDS = {
  /** Below this absolute percent of usage, a variance is unremarkable. */
  watchPct: 10,
  /** At or above this percent, a variance is red — if the THB floor is met too. */
  redPct: 20,
  /** THB per week floor, so a 50 % swing on a cheap herb does not shout. */
  redThbPerWeek: 50,
  /** Cumulative absolute THB over `cumulativeIntervals` that is red regardless of percent. */
  redCumulativeThb: 300,
  cumulativeIntervals: 4,
} as const

export type VarianceTone = 'ok' | 'watch' | 'red'

export interface VarianceToneInput {
  /** Signed variance as a percent of usage. Null when usage was zero. */
  variancePctOfUsage: number | null
  /** Signed variance in THB for this interval. */
  varianceThb: number
  /** Length of the interval, used to put THB on a per-week footing. */
  daysInInterval: number
  /**
   * Absolute THB this item has accumulated across the last
   * `cumulativeIntervals` intervals, including this one. Omit when unknown.
   */
  cumulativeAbsThb?: number
}

/** Variance THB expressed per week, so intervals of different lengths compare. */
export function thbPerWeek(varianceThb: number, daysInInterval: number): number {
  if (daysInInterval <= 0) return 0
  return (varianceThb * 7) / daysInInterval
}

/**
 * How loudly a variance row should read.
 *
 * Two independent routes to red, per spec §6: a big percentage that also
 * moves real money this interval, or a steady drip that adds up across
 * intervals even when no single one looks bad.
 */
export function varianceTone(input: VarianceToneInput): VarianceTone {
  const { variancePctOfUsage, varianceThb, daysInInterval, cumulativeAbsThb } = input

  if (
    cumulativeAbsThb !== undefined &&
    Math.abs(cumulativeAbsThb) >= VARIANCE_THRESHOLDS.redCumulativeThb
  ) {
    return 'red'
  }

  // With no usage there is no percentage to judge, so only the cumulative
  // rule above can make such a row red.
  if (variancePctOfUsage === null) return 'ok'

  const absPct = Math.abs(variancePctOfUsage)
  const absThbWeek = Math.abs(thbPerWeek(varianceThb, daysInInterval))

  if (absPct >= VARIANCE_THRESHOLDS.redPct && absThbWeek >= VARIANCE_THRESHOLDS.redThbPerWeek) {
    return 'red'
  }
  if (absPct >= VARIANCE_THRESHOLDS.watchPct) return 'watch'
  return 'ok'
}

/** Tailwind classes per tone — kept beside the thresholds so they stay in step. */
export const VARIANCE_TONE_CLASS: Record<VarianceTone, string> = {
  ok: 'text-cream/80',
  watch: 'text-amber-watch',
  red: 'text-brick-bright',
}

/** One-line explanation of why a row reads as it does, for a title attribute. */
export function varianceToneReason(tone: VarianceTone): string {
  switch (tone) {
    case 'red':
      return `At or above ${VARIANCE_THRESHOLDS.redPct}% of usage and THB ${VARIANCE_THRESHOLDS.redThbPerWeek}+ a week, or THB ${VARIANCE_THRESHOLDS.redCumulativeThb}+ accumulated over ${VARIANCE_THRESHOLDS.cumulativeIntervals} intervals`
    case 'watch':
      return `Between ${VARIANCE_THRESHOLDS.watchPct}% and ${VARIANCE_THRESHOLDS.redPct}% of usage`
    case 'ok':
      return `Under ${VARIANCE_THRESHOLDS.watchPct}% of usage`
  }
}
