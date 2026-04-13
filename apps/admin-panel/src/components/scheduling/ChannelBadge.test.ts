import { describe, it, expect } from 'vitest'

describe('ChannelBadge', () => {
  it('module exports ChannelBadge', async () => {
    const mod = await import('./ChannelBadge')
    expect(mod.ChannelBadge).toBeDefined()
  })
})
