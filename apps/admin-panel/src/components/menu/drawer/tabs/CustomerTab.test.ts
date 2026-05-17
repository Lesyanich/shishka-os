import { describe, it, expect } from 'vitest'

describe('CustomerTab', () => {
  it('exports CustomerTab component', async () => {
    const mod = await import('./CustomerTab')
    expect(mod.CustomerTab).toBeDefined()
  })
})
