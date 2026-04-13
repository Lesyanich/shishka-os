import { describe, it, expect } from 'vitest'

describe('OwnerGallery', () => {
  it('exports OwnerGallery component', async () => {
    const mod = await import('./OwnerGallery')
    expect(mod.OwnerGallery).toBeDefined()
    expect(typeof mod.OwnerGallery).toBe('function')
  })
})
