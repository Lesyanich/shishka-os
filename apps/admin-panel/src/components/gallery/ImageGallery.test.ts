import { describe, it, expect } from 'vitest'

describe('ImageGallery', () => {
  it('exports ImageGallery component', async () => {
    const mod = await import('./ImageGallery')
    expect(mod.ImageGallery).toBeDefined()
    expect(typeof mod.ImageGallery).toBe('function')
  })
})
