import { describe, it, expect } from 'vitest'

describe('StaffPage', () => {
  it('exports StaffPage component', async () => {
    const mod = await import('./StaffPage')
    expect(mod.StaffPage).toBeDefined()
    expect(typeof mod.StaffPage).toBe('function')
  })
})
