import { describe, it, expect } from 'vitest'

describe('StaffSchedulePage', () => {
  it('exports the StaffSchedulePage component', async () => {
    const mod = await import('./StaffSchedulePage')
    expect(mod.StaffSchedulePage).toBeDefined()
    expect(typeof mod.StaffSchedulePage).toBe('function')
  })
})
