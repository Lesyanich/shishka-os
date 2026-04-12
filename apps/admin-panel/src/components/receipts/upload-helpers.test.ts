import { describe, it, expect } from 'vitest'

describe('upload-helpers', () => {
  it('should export upload helpers', async () => {
    const mod = await import('./upload-helpers')
    expect(mod.compressImage).toBeDefined()
    expect(mod.uploadToStorage).toBeDefined()
    expect(mod.MAX_FILE_SIZE).toBe(5 * 1024 * 1024)
    expect(mod.ACCEPT).toContain('image/jpeg')
  })
})
