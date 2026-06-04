import { describe, it, expect } from 'vitest'

describe('useScheduleTemplates', () => {
  it('module exports the hook', async () => {
    const mod = await import('./useScheduleTemplates')
    expect(typeof mod.useScheduleTemplates).toBe('function')
  })
})
