import { describe, it, expect } from 'vitest'

describe('useAttendanceExcuses', () => {
  it('exports the useAttendanceExcuses hook', async () => {
    const mod = await import('./useAttendanceExcuses')
    expect(typeof mod.useAttendanceExcuses).toBe('function')
  })
})
