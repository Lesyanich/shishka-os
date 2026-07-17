import { describe, it, expect } from 'vitest'

describe('useUnworkedTime', () => {
  it('exports the useUnworkedTime hook', async () => {
    const mod = await import('./useUnworkedTime')
    expect(typeof mod.useUnworkedTime).toBe('function')
  })
})
