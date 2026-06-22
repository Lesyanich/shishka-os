import { describe, it, expect } from 'vitest'
import { resolveTab } from './useTabParam'

const TABS = ['schedule', 'staff', 'templates'] as const

describe('resolveTab', () => {
  it('returns the param when it is a valid tab', () => {
    expect(resolveTab('staff', TABS, 'schedule')).toBe('staff')
    expect(resolveTab('templates', TABS, 'schedule')).toBe('templates')
  })

  it('falls back when the param is missing (null)', () => {
    expect(resolveTab(null, TABS, 'schedule')).toBe('schedule')
  })

  it('falls back when the param is empty or not a known tab', () => {
    expect(resolveTab('', TABS, 'schedule')).toBe('schedule')
    expect(resolveTab('bogus', TABS, 'schedule')).toBe('schedule')
    expect(resolveTab('STAFF', TABS, 'schedule')).toBe('schedule') // case-sensitive
  })
})
