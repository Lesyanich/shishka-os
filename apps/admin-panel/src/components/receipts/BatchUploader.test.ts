import { describe, it, expect } from 'vitest'

describe('BatchUploader', () => {
  it('should export BatchUploader component', async () => {
    const mod = await import('./BatchUploader')
    expect(mod.BatchUploader).toBeDefined()
    expect(typeof mod.BatchUploader).toBe('function')
  })
})
