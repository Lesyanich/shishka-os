import { describe, it, expect } from 'vitest'

describe('owner/InlineEditCell', () => {
  it('exports InlineEditCell component', async () => {
    const mod = await import('./InlineEditCell')
    expect(mod.InlineEditCell).toBeDefined()
    expect(typeof mod.InlineEditCell).toBe('function')
  })
})
