import { describe, it, expect } from 'vitest'

describe('StaffTasksPage', () => {
  it('exports StaffTasksPage component', async () => {
    const mod = await import('./StaffTasksPage')
    expect(mod.StaffTasksPage).toBeDefined()
    expect(typeof mod.StaffTasksPage).toBe('function')
  })
})
