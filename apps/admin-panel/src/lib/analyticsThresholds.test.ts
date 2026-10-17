import { describe, it, expect } from 'vitest'
import {
  VARIANCE_THRESHOLDS,
  VARIANCE_TONE_CLASS,
  thbPerWeek,
  varianceTone,
  varianceToneReason,
} from './analyticsThresholds'

/* These numbers are the CEO's to retune after four weeks of real counts
   (spec section 10, decision 2). The tests pin the BEHAVIOUR of the rules, and
   read the cut-offs from the constants, so a retune changes one file and these
   keep passing. */

describe('thbPerWeek', () => {
  it('leaves a 7-day interval alone', () => {
    expect(thbPerWeek(100, 7)).toBeCloseTo(100)
  })

  it('scales a fortnight down and a short interval up', () => {
    expect(thbPerWeek(100, 14)).toBeCloseTo(50)
    expect(thbPerWeek(100, 1)).toBeCloseTo(700)
  })

  it('never divides by zero', () => {
    expect(thbPerWeek(100, 0)).toBe(0)
  })
})

describe('varianceTone', () => {
  const base = { varianceThb: 1000, daysInInterval: 7 }

  it('is ok below the watch threshold', () => {
    expect(varianceTone({ ...base, variancePctOfUsage: VARIANCE_THRESHOLDS.watchPct - 1 })).toBe('ok')
  })

  it('is watch from the watch threshold up to red', () => {
    expect(varianceTone({ ...base, variancePctOfUsage: VARIANCE_THRESHOLDS.watchPct })).toBe('watch')
    expect(varianceTone({ ...base, variancePctOfUsage: VARIANCE_THRESHOLDS.redPct - 1 })).toBe('watch')
  })

  it('is red when a big percentage also moves real money', () => {
    expect(varianceTone({ ...base, variancePctOfUsage: VARIANCE_THRESHOLDS.redPct })).toBe('red')
  })

  it('is only watch when the percentage is big but the money is not', () => {
    // The point of the THB floor: a 50 percent swing on a cheap herb must not shout.
    expect(
      varianceTone({
        variancePctOfUsage: 50,
        varianceThb: VARIANCE_THRESHOLDS.redThbPerWeek - 1,
        daysInInterval: 7,
      }),
    ).toBe('watch')
  })

  it('judges money per week, not per interval', () => {
    // THB 60 over a fortnight is THB 30 a week, under the floor.
    expect(varianceTone({ variancePctOfUsage: 40, varianceThb: 60, daysInInterval: 14 })).toBe('watch')
    // The same 60 over 7 days clears it.
    expect(varianceTone({ variancePctOfUsage: 40, varianceThb: 60, daysInInterval: 7 })).toBe('red')
  })

  it('is red on a steady drip even when no single interval looks bad', () => {
    expect(
      varianceTone({
        variancePctOfUsage: 2,
        varianceThb: 10,
        daysInInterval: 7,
        cumulativeAbsThb: VARIANCE_THRESHOLDS.redCumulativeThb,
      }),
    ).toBe('red')
  })

  it('treats negative variances by magnitude, not sign', () => {
    // A surplus is as much a signal as a shortage.
    expect(varianceTone({ ...base, variancePctOfUsage: -VARIANCE_THRESHOLDS.redPct })).toBe('red')
    expect(varianceTone({ variancePctOfUsage: 2, varianceThb: -400, daysInInterval: 7, cumulativeAbsThb: 400 })).toBe('red')
  })

  it('cannot judge a percentage that does not exist', () => {
    // No usage in the interval, so there is no percent-of-usage to compare.
    expect(varianceTone({ ...base, variancePctOfUsage: null })).toBe('ok')
  })

  it('still flags a no-usage row on the cumulative rule', () => {
    expect(
      varianceTone({ ...base, variancePctOfUsage: null, cumulativeAbsThb: 500 }),
    ).toBe('red')
  })
})

describe('tone presentation', () => {
  it('has a class for every tone', () => {
    for (const tone of ['ok', 'watch', 'red'] as const) {
      expect(VARIANCE_TONE_CLASS[tone]).toBeTruthy()
    }
  })

  it('explains each tone in terms of the live thresholds', () => {
    expect(varianceToneReason('red')).toContain(String(VARIANCE_THRESHOLDS.redPct))
    expect(varianceToneReason('watch')).toContain(String(VARIANCE_THRESHOLDS.watchPct))
    expect(varianceToneReason('ok')).toContain(String(VARIANCE_THRESHOLDS.watchPct))
  })
})
