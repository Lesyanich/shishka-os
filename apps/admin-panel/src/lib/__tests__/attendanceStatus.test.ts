import { describe, it, expect } from 'vitest'
import {
  attendanceMeta,
  attendanceMetaGeneric,
  isNonWorkingStatus,
} from '../attendanceStatus'

describe('lib/attendanceStatus', () => {
  it('isNonWorkingStatus: worked and empty are working; everything else overrides', () => {
    expect(isNonWorkingStatus('worked')).toBe(false)
    expect(isNonWorkingStatus(null)).toBe(false)
    expect(isNonWorkingStatus(undefined)).toBe(false)
    expect(isNonWorkingStatus('')).toBe(false)
    expect(isNonWorkingStatus('absent')).toBe(true)
    expect(isNonWorkingStatus('sick_leave')).toBe(true)
    expect(isNonWorkingStatus('day_off')).toBe(true)
    expect(isNonWorkingStatus('holiday')).toBe(true)
  })

  it('attendanceMeta: known status -> meta, null/unknown -> null', () => {
    expect(attendanceMeta('absent')?.short).toBe('Absent')
    expect(attendanceMeta('sick_leave')?.short).toBe('Sick')
    expect(attendanceMeta('day_off')?.short).toBe('Off')
    expect(attendanceMeta(null)).toBeNull()
    expect(attendanceMeta('not_a_status')).toBeNull()
  })

  it('every known status has a non-empty badge and short label', () => {
    for (const s of [
      'worked',
      'absent',
      'sick_leave',
      'annual_leave',
      'personal_leave',
      'maternity_leave',
      'paternity_leave',
      'holiday',
      'day_off',
    ]) {
      const meta = attendanceMeta(s)
      expect(meta, `meta for ${s}`).not.toBeNull()
      expect(meta!.badge.length).toBeGreaterThan(0)
      expect(meta!.short.length).toBeGreaterThan(0)
    }
  })

  it('attendanceMetaGeneric: hides the specific leave reason behind "Off"', () => {
    // 'worked' / empty are not overrides — no badge.
    expect(attendanceMetaGeneric('worked')).toBeNull()
    expect(attendanceMetaGeneric(null)).toBeNull()
    // Any non-working reason collapses to a single generic "Off".
    expect(attendanceMetaGeneric('sick_leave')?.short).toBe('Off')
    expect(attendanceMetaGeneric('absent')?.short).toBe('Off')
    expect(attendanceMetaGeneric('annual_leave')?.short).toBe('Off')
    // The generic badge must not leak the specific label.
    expect(attendanceMetaGeneric('sick_leave')?.label).toBe('Off')
  })
})
