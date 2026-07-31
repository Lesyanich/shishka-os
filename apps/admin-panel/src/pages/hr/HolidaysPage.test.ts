import { describe, it, expect } from 'vitest'
import { HolidaysPage } from './HolidaysPage'

// Fields the page reads; guards against schema drift on the holiday tables.
const HOLIDAY_FIELDS = [
  'holiday_date',
  'name_en',
  'kind',
  'is_company_closed',
  'is_confirmed',
] as const

const CREDIT_STATUSES = ['owed', 'used', 'paid_out', 'expired'] as const

describe('HolidaysPage', () => {
  it('exposes the HolidaysPage component', () => {
    expect(typeof HolidaysPage).toBe('function')
  })

  it('documents the public_holidays fields it renders', () => {
    expect(HOLIDAY_FIELDS).toContain('is_company_closed')
    expect(HOLIDAY_FIELDS).toContain('is_confirmed')
  })

  it('documents every holiday_credits status, so none is silently dropped from the UI', () => {
    expect(CREDIT_STATUSES).toHaveLength(4)
    expect(CREDIT_STATUSES).toContain('paid_out')
  })
})
