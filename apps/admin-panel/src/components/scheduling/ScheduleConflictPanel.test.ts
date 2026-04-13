import { describe, it, expect } from 'vitest'

describe('ScheduleConflictPanel', () => {
  it('module exports ScheduleConflictPanel', async () => {
    const mod = await import('./ScheduleConflictPanel')
    expect(mod.ScheduleConflictPanel).toBeDefined()
  })
})
