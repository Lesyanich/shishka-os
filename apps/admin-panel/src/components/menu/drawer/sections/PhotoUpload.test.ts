import { describe, it, expect } from 'vitest'

describe('PhotoUpload', () => {
  it('exports the component', async () => {
    const mod = await import('./PhotoUpload')
    expect(typeof mod.PhotoUpload).toBe('function')
  })
})
