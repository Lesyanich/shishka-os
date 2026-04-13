import { describe, it, expect } from 'vitest'

describe('TaskComplete', () => {
  it('exports TaskComplete component', async () => {
    const mod = await import('./TaskComplete')
    expect(mod.TaskComplete).toBeDefined()
  })
})
