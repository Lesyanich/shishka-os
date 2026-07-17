import { describe, it, expect } from 'vitest'
import {
  aggregateByStaff,
  lateTrend,
  activeWarnings,
  strongestActiveWarning,
  nextWarningKind,
  unworkedTimeValue,
  formatMinutes,
  type PunctualityRow,
  type StaffWarning,
  type PunchStatus,
} from './punctuality'

function row(
  staff_id: string,
  shift_date: string,
  punch_status: PunchStatus,
  late_minutes = 0,
  is_excused = false,
  is_enforced = true,
): PunctualityRow {
  return {
    shift_id: `${staff_id}-${shift_date}`,
    staff_id,
    shift_date,
    start_time: '09:00:00',
    end_time: '18:00:00',
    first_in_at: punch_status === 'on_time' || punch_status === 'late' ? `${shift_date}T02:00:00Z` : null,
    first_in_local: punch_status === 'on_time' ? '09:05:00' : punch_status === 'late' ? '09:25:00' : null,
    grace_min: 10,
    punch_status,
    late_minutes,
    is_excused,
    excuse_reason: is_excused ? 'told us in advance' : null,
    is_enforced,
  }
}

function warning(
  id: string,
  kind: StaffWarning['kind'],
  issued_on: string,
  expires_on: string,
  status: StaffWarning['status'] = 'approved',
): StaffWarning {
  return {
    id,
    staff_id: 'mint',
    kind,
    status,
    issued_on,
    expires_on,
    for_period: null,
    signed_on: null,
    reason: 'lateness',
    doc_url: null,
    notes: null,
    issued_by: null,
    created_at: `${issued_on}T00:00:00Z`,
  }
}

describe('aggregateByStaff', () => {
  it('buckets statuses and sums late minutes', () => {
    const result = aggregateByStaff([
      row('mint', '2026-07-01', 'on_time'),
      row('mint', '2026-07-02', 'late', 25),
      row('mint', '2026-07-03', 'late', 15),
      row('mint', '2026-07-04', 'no_clock_in'),
      row('alex', '2026-07-01', 'on_time'),
    ])

    const mint = result.get('mint')!
    expect(mint.onTimeCount).toBe(1)
    expect(mint.lateCount).toBe(2)
    expect(mint.lateMinutesTotal).toBe(40)
    expect(mint.noClockInDays).toBe(1)
    expect(result.get('alex')!.lateCount).toBe(0)
  })

  it('excludes pending shifts from settled counts and incidents', () => {
    const result = aggregateByStaff([
      row('mint', '2026-07-01', 'on_time'),
      row('mint', '2026-07-02', 'pending'),
    ])

    const mint = result.get('mint')!
    expect(mint.settledShifts).toBe(1)
    expect(mint.noClockInDays).toBe(0)
    expect(mint.incidents).toHaveLength(0)
  })

  it('returns incidents newest-first', () => {
    const result = aggregateByStaff([
      row('mint', '2026-07-02', 'late', 10),
      row('mint', '2026-07-10', 'no_clock_in'),
      row('mint', '2026-07-05', 'late', 5),
    ])

    expect(result.get('mint')!.incidents.map((i) => i.shift_date)).toEqual([
      '2026-07-10',
      '2026-07-05',
      '2026-07-02',
    ])
  })

  it('returns an empty map for no rows', () => {
    expect(aggregateByStaff([]).size).toBe(0)
  })

  it('never counts incidents from before the employee signed the policy', () => {
    // The punch clock predates the policy: everyone has months of "no clock-in"
    // days they actually worked. Those must not become grounds for anything.
    const result = aggregateByStaff([
      row('alex', '2026-06-01', 'no_clock_in', 0, false, false),
      row('alex', '2026-06-02', 'late', 40, false, false),
      row('alex', '2026-07-20', 'late', 25, false, true),
    ])

    const alex = result.get('alex')!
    expect(alex.unenforcedCount).toBe(2)
    expect(alex.lateCount).toBe(1)
    expect(alex.lateMinutesTotal).toBe(25)
    expect(alex.noClockInDays).toBe(0)
    expect(alex.incidents).toHaveLength(3)
  })

  it('keeps excused incidents out of the counter and the pay total', () => {
    const result = aggregateByStaff([
      row('mint', '2026-07-01', 'late', 25),
      row('mint', '2026-07-02', 'late', 30, true),
      row('mint', '2026-07-03', 'no_clock_in', 0, true),
    ])

    const mint = result.get('mint')!
    expect(mint.lateCount).toBe(1)
    expect(mint.lateMinutesTotal).toBe(25)
    expect(mint.noClockInDays).toBe(0)
    expect(mint.excusedCount).toBe(2)
    // still visible in the drill-down — excused is not erased, just not counted
    expect(mint.incidents).toHaveLength(3)
  })
})

describe('nextWarningKind', () => {
  it('walks the LEG-004 ladder', () => {
    expect(nextWarningKind([])).toBe('verbal')
    expect(nextWarningKind([warning('w', 'verbal', '2026-01-01', '2027-01-01')])).toBe('written_1')
    expect(nextWarningKind([warning('w', 'written_1', '2026-01-01', '2027-01-01')])).toBe('written_2_final')
  })

  it('stays at final once a final warning is live', () => {
    expect(nextWarningKind([warning('w', 'written_2_final', '2026-01-01', '2027-01-01')])).toBe('written_2_final')
  })
})

describe('lateTrend', () => {
  const current = aggregateByStaff([
    row('mint', '2026-07-01', 'late', 10),
    row('mint', '2026-07-02', 'late', 10),
    row('mint', '2026-07-03', 'late', 10),
  ])
  const previous = aggregateByStaff([row('mint', '2026-06-01', 'late', 10)])

  it('is positive when lateness grows', () => {
    expect(lateTrend(current, previous, 'mint')).toBe(2)
  })

  it('treats a staff member missing from a month as zero', () => {
    expect(lateTrend(current, new Map(), 'mint')).toBe(3)
    expect(lateTrend(new Map(), previous, 'mint')).toBe(-1)
    expect(lateTrend(current, previous, 'ghost')).toBe(0)
  })
})

describe('activeWarnings', () => {
  const warnings = [
    warning('w1', 'verbal', '2025-07-01', '2026-07-01'), // expired
    warning('w2', 'written_1', '2026-01-10', '2027-01-10'),
    warning('w3', 'written_2_final', '2026-05-01', '2027-05-01'),
  ]

  it('drops warnings past their 1-year window and sorts newest-first', () => {
    const active = activeWarnings(warnings, '2026-07-17')
    expect(active.map((w) => w.id)).toEqual(['w3', 'w2'])
  })

  it('keeps a warning that expires today (LPA §119(4) — inclusive)', () => {
    expect(activeWarnings([warning('w', 'written_1', '2025-07-17', '2026-07-17')], '2026-07-17')).toHaveLength(1)
  })

  it('ignores dismissed proposals — a rejected warning is not a warning', () => {
    const dismissed = warning('d', 'written_1', '2026-06-01', '2027-06-01', 'dismissed')
    expect(activeWarnings([dismissed], '2026-07-17')).toHaveLength(0)
    expect(strongestActiveWarning([dismissed], '2026-07-17')).toBeNull()
  })

  it('picks the highest-severity active warning', () => {
    expect(strongestActiveWarning(warnings, '2026-07-17')!.kind).toBe('written_2_final')
    expect(strongestActiveWarning([warnings[0]], '2026-07-17')).toBeNull()
    expect(strongestActiveWarning([], '2026-07-17')).toBeNull()
  })
})

describe('unworkedTimeValue', () => {
  it('prices late minutes at salary/30/9h (LEG-004 §3)', () => {
    // 15,000 THB → 500/day → 55.56/hour → 0.926/min; 60 min ≈ 55.56
    expect(unworkedTimeValue(15000, 60)).toBeCloseTo(55.56, 1)
    expect(unworkedTimeValue(15000, 30)).toBeCloseTo(27.78, 1)
  })

  it('returns 0 for non-positive inputs', () => {
    expect(unworkedTimeValue(0, 60)).toBe(0)
    expect(unworkedTimeValue(15000, 0)).toBe(0)
    expect(unworkedTimeValue(15000, -5)).toBe(0)
  })
})

describe('formatMinutes', () => {
  it('formats minutes and hours', () => {
    expect(formatMinutes(25)).toBe('25 min')
    expect(formatMinutes(95)).toBe('1h 35m')
    expect(formatMinutes(120)).toBe('2h')
  })

  it('renders a dash for nothing', () => {
    expect(formatMinutes(0)).toBe('—')
  })
})
