import { describe, it, expect, vi } from 'vitest'

vi.mock('./supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        createSignedUrls: async (paths: string[]) => ({
          data: paths.map((p) => ({ path: p, signedUrl: `/object/sign/task-photos/${p}?token=t`, error: null })),
          error: null,
        }),
      }),
    },
  },
}))

const PUBLIC_TASK =
  'https://qcqgtcsjoacuktcewpvo.supabase.co/storage/v1/object/public/task-photos/t1/1.jpg'
const PUBLIC_RECEIPT =
  'https://qcqgtcsjoacuktcewpvo.supabase.co/storage/v1/object/public/receipts/inbox/a.jpg'

describe('taskPhotoUrls', () => {
  it('pins the task-photos bucket', async () => {
    const { TASK_PHOTOS_BUCKET } = await import('./taskPhotoUrls')
    expect(TASK_PHOTOS_BUCKET).toBe('task-photos')
  })

  it('resolves a bare path — the shape the bucket has held since day one', async () => {
    const { toTaskPhotoPath } = await import('./taskPhotoUrls')
    expect(toTaskPhotoPath('t1/1.jpg')).toBe('t1/1.jpg')
  })

  // The Telegram bot wrote full public URLs before this cutover; tolerate them.
  it('still resolves a legacy full public URL', async () => {
    const { toTaskPhotoPath } = await import('./taskPhotoUrls')
    expect(toTaskPhotoPath(PUBLIC_TASK)).toBe('t1/1.jpg')
  })

  // Cross-bucket safety: a receipts ref must never be signed as a task photo.
  it('rejects a ref from another bucket', async () => {
    const { toTaskPhotoPath } = await import('./taskPhotoUrls')
    expect(toTaskPhotoPath(PUBLIC_RECEIPT)).toBeNull()
  })

  it('signs task photo refs', async () => {
    const { signTaskPhotoUrls } = await import('./taskPhotoUrls')
    const out = await signTaskPhotoUrls(['t1/1.jpg'])
    expect(out['t1/1.jpg']).toContain('/object/sign/task-photos/')
  })
})
