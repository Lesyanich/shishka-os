import { describe, it, expect } from 'vitest'

describe('TaskDetailModal', () => {
  it('exports TaskDetailModal component', async () => {
    const mod = await import('./TaskDetailModal')
    expect(mod.TaskDetailModal).toBeDefined()
    expect(typeof mod.TaskDetailModal).toBe('function')
  })
})
