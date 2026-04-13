import { describe, it, expect } from 'vitest'

describe('DashboardPage', () => {
  it('exports DashboardPage component', async () => {
    const mod = await import('./DashboardPage')
    expect(mod.DashboardPage).toBeDefined()
  })
})
