import { describe, it, expect } from 'vitest'

describe('useStaffList', () => {
  it('module exports useStaffList', async () => {
    const mod = await import('./useStaffList')
    expect(mod.useStaffList).toBeDefined()
  })
})
