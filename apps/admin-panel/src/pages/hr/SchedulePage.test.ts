import { describe, it, expect } from 'vitest'

describe('SchedulePage', () => {
  it('exports SchedulePage component', async () => {
    const mod = await import('./SchedulePage')
    expect(mod.SchedulePage).toBeDefined()
    expect(typeof mod.SchedulePage).toBe('function')
  })
})
