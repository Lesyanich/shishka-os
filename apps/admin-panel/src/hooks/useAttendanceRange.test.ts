import { describe, it, expect } from 'vitest'

describe('useAttendanceRange module', () => {
  it('exports the useAttendanceRange hook', async () => {
    const mod = await import('./useAttendanceRange')
    expect(typeof mod.useAttendanceRange).toBe('function')
  })
})
