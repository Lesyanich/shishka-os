import { describe, it, expect } from 'vitest'

describe('useTaskPhotoUpload', () => {
  it('exports the hook', async () => {
    const mod = await import('./useTaskPhotoUpload')
    expect(mod.useTaskPhotoUpload).toBeDefined()
    expect(typeof mod.useTaskPhotoUpload).toBe('function')
  })
})
