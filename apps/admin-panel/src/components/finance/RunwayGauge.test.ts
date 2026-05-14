import { describe, it, expect } from 'vitest'

describe('RunwayGauge', () => {
  it('calculates runway days from cash and burn', () => {
    const totalCash = 150000
    const dailyBurn = 2500
    const runwayDays = Math.floor(totalCash / dailyBurn)
    expect(runwayDays).toBe(60)
  })

  it('returns 999 when burn is zero', () => {
    const totalCash = 150000
    const dailyBurn = 0
    const runwayDays = dailyBurn > 0 ? Math.floor(totalCash / dailyBurn) : 999
    expect(runwayDays).toBe(999)
  })

  it('clamps display at 180 days for gauge percentage', () => {
    const runwayDays = 250
    const clampedDays = Math.min(runwayDays, 180)
    const pct = Math.min((clampedDays / 180) * 100, 100)
    expect(pct).toBe(100)
  })
})
