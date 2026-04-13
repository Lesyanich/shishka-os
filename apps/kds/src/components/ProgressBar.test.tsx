import { describe, it, expect } from 'vitest'

describe('ProgressBar', () => {
  it('exports ProgressBar component', async () => {
    const mod = await import('./ProgressBar')
    expect(mod.ProgressBar).toBeDefined()
  })
})
