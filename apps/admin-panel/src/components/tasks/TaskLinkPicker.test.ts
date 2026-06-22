import { describe, it, expect } from 'vitest'

describe('TaskLinkPicker', () => {
  it('exports TaskLinkPicker component', async () => {
    const mod = await import('./TaskLinkPicker')
    expect(mod.TaskLinkPicker).toBeDefined()
    expect(typeof mod.TaskLinkPicker).toBe('function')
  })
})
