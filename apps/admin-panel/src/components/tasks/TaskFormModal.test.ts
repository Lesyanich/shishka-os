import { describe, it, expect } from 'vitest'

describe('TaskFormModal', () => {
  it('exports TaskFormModal component', async () => {
    const mod = await import('./TaskFormModal')
    expect(mod.TaskFormModal).toBeDefined()
    expect(typeof mod.TaskFormModal).toBe('function')
  })
})
