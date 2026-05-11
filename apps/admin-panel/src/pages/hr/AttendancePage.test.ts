import { describe, it, expect } from 'vitest'

describe('AttendancePage', () => {
  it('exports AttendancePage component', async () => {
    const mod = await import('./AttendancePage')
    expect(mod.AttendancePage).toBeDefined()
    expect(typeof mod.AttendancePage).toBe('function')
  })
})
