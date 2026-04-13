import { describe, it, expect } from 'vitest'

describe('HACCPCheckpoint', () => {
  it('exports HACCPCheckpoint component', async () => {
    const mod = await import('./HACCPCheckpoint')
    expect(mod.HACCPCheckpoint).toBeDefined()
  })
})
