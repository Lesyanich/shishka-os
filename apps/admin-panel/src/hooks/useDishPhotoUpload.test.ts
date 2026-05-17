import { describe, it, expect } from 'vitest'

describe('useDishPhotoUpload', () => {
  it('exports the hook factory', async () => {
    const mod = await import('./useDishPhotoUpload')
    expect(typeof mod.useDishPhotoUpload).toBe('function')
  })
})
