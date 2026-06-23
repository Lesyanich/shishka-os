import { describe, it, expect } from 'vitest'

describe('useShiftClock module', () => {
  it('exports useShiftClock and useWeekSchedule hooks', async () => {
    const mod = await import('./useShiftClock')
    expect(typeof mod.useShiftClock).toBe('function')
    expect(typeof mod.useWeekSchedule).toBe('function')
  })
})
