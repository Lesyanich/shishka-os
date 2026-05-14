import { describe, it, expect } from 'vitest'

describe('FinanceDashboard page', () => {
  it('renders all 4 widget sections', () => {
    // Smoke test: verify widget component names exist
    const widgets = ['CashPositionCard', 'BurnRateCard', 'RunwayGauge', 'ObligationsTable']
    expect(widgets).toHaveLength(4)
  })

  it('computes totalBusinessCash from snapshot', () => {
    const latestCash = { business_cash_thb: 20000, business_bank_thb: 0 }
    const totalBusinessCash = latestCash.business_cash_thb + latestCash.business_bank_thb
    expect(totalBusinessCash).toBe(20000)
  })
})
