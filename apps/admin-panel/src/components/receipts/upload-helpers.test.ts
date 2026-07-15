import { describe, it, expect, vi } from 'vitest'

const uploadMock = vi.fn(async () => ({ error: null }))
const getPublicUrlSpy = vi.fn(() => ({ data: { publicUrl: 'https://x/public/receipts/nope.webp' } }))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({ upload: uploadMock, getPublicUrl: getPublicUrlSpy }),
    },
  },
}))

describe('upload-helpers', () => {
  it('should export upload helpers', async () => {
    const mod = await import('./upload-helpers')
    expect(mod.compressImage).toBeDefined()
    expect(mod.uploadToStorage).toBeDefined()
    expect(mod.MAX_FILE_SIZE).toBe(5 * 1024 * 1024)
    expect(mod.ACCEPT).toContain('image/jpeg')
  })

  // T3 (MC 69395970): what lands in receipt_inbox.photo_urls must be an
  // in-bucket PATH, never a public URL. A persisted public URL keeps resolving
  // no matter what the bucket policy says, which is the whole thing we are
  // undoing — so this asserts the contract rather than trusting the caller.
  it('returns the in-bucket path, and never mints a public URL', async () => {
    const { uploadToStorage } = await import('./upload-helpers')
    const file = new File(['x'], 'receipt.webp', { type: 'image/webp' })

    const res = await uploadToStorage(file, 0)

    expect('path' in res).toBe(true)
    const path = (res as { path: string }).path
    expect(path).toMatch(/^inbox\/\d+_0_[a-z0-9]+\.webp$/)
    expect(path).not.toMatch(/^https?:\/\//)
    expect(getPublicUrlSpy).not.toHaveBeenCalled()
  })

  it('surfaces the storage error instead of a path', async () => {
    uploadMock.mockResolvedValueOnce({ error: { message: 'boom' } } as never)
    const { uploadToStorage } = await import('./upload-helpers')
    const file = new File(['x'], 'receipt.webp', { type: 'image/webp' })

    const res = await uploadToStorage(file, 1)

    expect(res).toEqual({ error: 'boom' })
  })
})
