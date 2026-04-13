import { describe, it, expect } from 'vitest'

describe('CustomerPreview', () => {
  it('exports CustomerPreview component', async () => {
    const mod = await import('./CustomerPreview')
    expect(mod.CustomerPreview).toBeDefined()
    expect(typeof mod.CustomerPreview).toBe('function')
  })
})
