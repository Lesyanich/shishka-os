import { describe, it, expect } from 'vitest'

describe('TaskRow', () => {
  it('exports TaskRow component', async () => {
    const mod = await import('./TaskRow')
    expect(mod.TaskRow).toBeDefined()
    expect(typeof mod.TaskRow).toBe('function')
  })
})
