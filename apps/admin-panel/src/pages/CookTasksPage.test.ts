import { describe, it, expect } from 'vitest'

describe('CookTasksPage', () => {
  it('exports CookTasksPage component', async () => {
    const mod = await import('./CookTasksPage')
    expect(mod.CookTasksPage).toBeDefined()
    expect(typeof mod.CookTasksPage).toBe('function')
  })
})
