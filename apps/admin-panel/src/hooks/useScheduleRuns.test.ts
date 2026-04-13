import { describe, it, expect } from 'vitest'

describe('useScheduleRuns', () => {
  it('module exports useScheduleRuns', async () => {
    const mod = await import('./useScheduleRuns')
    expect(mod.useScheduleRuns).toBeDefined()
  })
})
