import { describe, it, expect } from 'vitest'

describe('TelegramLinkPanel', () => {
  it('exports TelegramLinkPanel component', async () => {
    const mod = await import('./TelegramLinkPanel')
    expect(mod.TelegramLinkPanel).toBeDefined()
    expect(typeof mod.TelegramLinkPanel).toBe('function')
  })
})
