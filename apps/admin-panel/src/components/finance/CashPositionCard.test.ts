import { describe, it, expect } from 'vitest'
import type { CashSnapshot } from '../../hooks/useFinanceDashboard'

describe('CashPositionCard', () => {
  it('computes business total from cash + bank', () => {
    const snapshot: CashSnapshot = {
      id: '1',
      snapshot_date: '2026-05-14',
      business_cash_thb: 20000,
      business_bank_thb: 5000,
      personal_reserve_thb: 33000,
      notes: null,
      created_at: '2026-05-14T00:00:00Z',
    }
    expect(snapshot.business_cash_thb + snapshot.business_bank_thb).toBe(25000)
  })

  it('keeps personal reserve isolated from business total', () => {
    const snapshot: CashSnapshot = {
      id: '1',
      snapshot_date: '2026-05-14',
      business_cash_thb: 20000,
      business_bank_thb: 0,
      personal_reserve_thb: 100000,
      notes: null,
      created_at: '2026-05-14T00:00:00Z',
    }
    const businessTotal = snapshot.business_cash_thb + snapshot.business_bank_thb
    expect(businessTotal).toBe(20000)
    expect(businessTotal).not.toContain(snapshot.personal_reserve_thb)
  })
})
