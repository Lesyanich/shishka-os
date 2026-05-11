import { describe, it, expect } from 'vitest'

describe('useAttendance', () => {
  it('exports useAttendance hook', async () => {
    const mod = await import('./use-attendance')
    expect(mod.useAttendance).toBeDefined()
    expect(typeof mod.useAttendance).toBe('function')
  })
})
