import { describe, it, expect } from 'vitest'

describe('useStaffTasks', () => {
  it('module exports useStaffTasks', async () => {
    const mod = await import('./useStaffTasks')
    expect(mod.useStaffTasks).toBeDefined()
    expect(typeof mod.useStaffTasks).toBe('function')
  })
})
