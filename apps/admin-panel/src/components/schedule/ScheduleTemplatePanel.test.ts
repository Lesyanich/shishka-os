import { describe, it, expect } from 'vitest'

describe('ScheduleTemplatePanel', () => {
  it('module exports the component', async () => {
    const mod = await import('./ScheduleTemplatePanel')
    expect(typeof mod.ScheduleTemplatePanel).toBe('function')
  })
})
