import { describe, it, expect } from 'vitest'

describe('ProtectedRoute', () => {
  it('exports ProtectedRoute component', async () => {
    const mod = await import('./ProtectedRoute')
    expect(mod.ProtectedRoute).toBeDefined()
  })
})
