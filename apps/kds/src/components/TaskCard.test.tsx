import { describe, it, expect } from 'vitest'

describe('TaskCard', () => {
  it('exports TaskCard component', async () => {
    const mod = await import('./TaskCard')
    expect(mod.TaskCard).toBeDefined()
  })
})
