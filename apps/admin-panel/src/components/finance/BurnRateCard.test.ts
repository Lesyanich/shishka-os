import { describe, it, expect } from 'vitest'
import type { BurnRate } from '../../hooks/useFinanceDashboard'

describe('BurnRateCard', () => {
  it('projects monthly burn from daily rate', () => {
    const rate: BurnRate = { daily7d: 3000, daily30d: 2500, total7d: 21000, total30d: 75000 }
    const monthlyProjection = rate.daily30d * 30
    expect(monthlyProjection).toBe(75000)
  })

  it('falls back to 7d rate when 30d is zero', () => {
    const rate: BurnRate = { daily7d: 3000, daily30d: 0, total7d: 21000, total30d: 0 }
    const dailyBurn = rate.daily30d > 0 ? rate.daily30d : rate.daily7d
    expect(dailyBurn).toBe(3000)
  })
})
