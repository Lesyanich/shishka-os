import { describe, it, expect } from 'vitest'

describe('useChannelMargins', () => {
  it('exports the hook', async () => {
    const mod = await import('./useChannelMargins')
    expect(mod.useChannelMargins).toBeDefined()
  })
})
