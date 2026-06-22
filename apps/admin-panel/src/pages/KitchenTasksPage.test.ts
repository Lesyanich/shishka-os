import { describe, it, expect } from 'vitest'

describe('KitchenTasksPage', () => {
  it('exports KitchenTasksPage component', async () => {
    const mod = await import('./KitchenTasksPage')
    expect(mod.KitchenTasksPage).toBeDefined()
    expect(typeof mod.KitchenTasksPage).toBe('function')
  })
})
