import { describe, it, expect } from 'vitest'
import { usePriceBook } from './usePriceBook'

// Smoke: the hook binds directly to Supabase (realtime + RPC); behaviour is
// covered via the Price Book UI. This guards the module against import-time
// regressions and keeps the public hook surface stable.
describe('usePriceBook', () => {
  it('exports a hook function', () => {
    expect(typeof usePriceBook).toBe('function')
    expect(usePriceBook.name).toBe('usePriceBook')
  })
})
