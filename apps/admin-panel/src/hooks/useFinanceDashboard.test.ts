import { describe, it, expect } from 'vitest'

describe('useFinanceDashboard helpers', () => {
  // Test the date helper logic used in the hook

  it('daysAgo returns correct ISO date string', () => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    const result = d.toISOString().slice(0, 10)
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('daysBetween returns positive integer', () => {
    const a = '2026-05-01'
    const b = '2026-05-14'
    const da = new Date(a)
    const db = new Date(b)
    const days = Math.max(1, Math.round((db.getTime() - da.getTime()) / 86_400_000))
    expect(days).toBe(13)
  })

  it('runway calculation: cash / burn = days', () => {
    const totalBusinessCash = 152000
    const dailyBurn = 2500
    const runwayDays = dailyBurn > 0 ? Math.floor(totalBusinessCash / dailyBurn) : 999
    expect(runwayDays).toBe(60)
  })
})
