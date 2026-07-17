import { describe, it, expect } from 'vitest'

describe('ClockInNudge', () => {
  it('exports the ClockInNudge component', async () => {
    const mod = await import('./ClockInNudge')
    expect(typeof mod.ClockInNudge).toBe('function')
    expect(mod.default).toBe(mod.ClockInNudge)
  })
})
