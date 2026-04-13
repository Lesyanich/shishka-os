import { describe, it, expect } from 'vitest'

describe('TaskPage', () => {
  it('exports TaskPage component', async () => {
    const mod = await import('./TaskPage')
    expect(mod.TaskPage).toBeDefined()
  })
})
