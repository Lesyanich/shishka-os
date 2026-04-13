import { describe, it, expect } from 'vitest'

describe('useCookTasks', () => {
  it('exports useCookTasks hook', async () => {
    const mod = await import('./useCookTasks')
    expect(mod.useCookTasks).toBeDefined()
  })
})
