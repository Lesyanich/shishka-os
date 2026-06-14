import { describe, it, expect } from 'vitest'

describe('useStaffTelegram', () => {
  it('module exports useStaffTelegram', async () => {
    const mod = await import('./useStaffTelegram')
    expect(mod.useStaffTelegram).toBeDefined()
    expect(typeof mod.useStaffTelegram).toBe('function')
    expect(mod.TELEGRAM_BOT_USERNAME).toBeTruthy()
  })
})
