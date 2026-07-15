import { describe, it, expect, vi } from 'vitest'

const createSignedUrls = vi.fn(async (paths: string[]) => ({
  data: paths.map((p) => ({ path: p, signedUrl: `/object/sign/x/${p}?token=t`, error: null })),
  error: null,
}))

vi.mock('./supabase', () => ({
  supabase: { storage: { from: () => ({ createSignedUrls }) } },
}))

const PUBLIC_RECEIPT =
  'https://qcqgtcsjoacuktcewpvo.supabase.co/storage/v1/object/public/receipts/inbox/a.jpg'
const SIGNED_RECEIPT =
  'https://qcqgtcsjoacuktcewpvo.supabase.co/storage/v1/object/sign/receipts/inbox/a.jpg?token=eyJ.x'
const PUBLIC_TASK =
  'https://qcqgtcsjoacuktcewpvo.supabase.co/storage/v1/object/public/task-photos/t1/1.jpg'
const GDRIVE = 'https://drive.google.com/file/d/1AbC/view'

describe('toStoragePath', () => {
  it('extracts the path from a public URL for the given bucket', async () => {
    const { toStoragePath } = await import('./signedStorage')
    expect(toStoragePath('receipts', PUBLIC_RECEIPT)).toBe('inbox/a.jpg')
    expect(toStoragePath('task-photos', PUBLIC_TASK)).toBe('t1/1.jpg')
  })

  it('extracts the path from a signed URL, dropping the token', async () => {
    const { toStoragePath } = await import('./signedStorage')
    expect(toStoragePath('receipts', SIGNED_RECEIPT)).toBe('inbox/a.jpg')
  })

  // The bucket argument must actually gate the match — otherwise a task-photos
  // ref could be signed against the receipts bucket and vice versa.
  it('does not match a URL belonging to a different bucket', async () => {
    const { toStoragePath } = await import('./signedStorage')
    expect(toStoragePath('receipts', PUBLIC_TASK)).toBeNull()
    expect(toStoragePath('task-photos', PUBLIC_RECEIPT)).toBeNull()
  })

  it('passes a bare path through and strips a redundant bucket prefix', async () => {
    const { toStoragePath } = await import('./signedStorage')
    expect(toStoragePath('task-photos', 't1/1.jpg')).toBe('t1/1.jpg')
    expect(toStoragePath('task-photos', 'task-photos/t1/1.jpg')).toBe('t1/1.jpg')
  })

  it('decodes percent-encoded paths', async () => {
    const { toStoragePath } = await import('./signedStorage')
    expect(
      toStoragePath('receipts', 'https://x.supabase.co/storage/v1/object/public/receipts/a%20b.jpg'),
    ).toBe('a b.jpg')
  })

  it('returns null for a foreign host so legacy Google Drive links are never signed', async () => {
    const { toStoragePath } = await import('./signedStorage')
    expect(toStoragePath('receipts', GDRIVE)).toBeNull()
  })

  it('returns null for empty input', async () => {
    const { toStoragePath } = await import('./signedStorage')
    expect(toStoragePath('receipts', '')).toBeNull()
  })
})

describe('isPdfRef', () => {
  it('detects .pdf case-insensitively', async () => {
    const { isPdfRef } = await import('./signedStorage')
    expect(isPdfRef('inbox/x.pdf')).toBe(true)
    expect(isPdfRef('inbox/X.PDF')).toBe(true)
  })

  // The regression this exists for: a signed URL ends in `?token=…`, so a naive
  // endsWith('.pdf') classifies every signed PDF as an image and renders it into
  // an <img> as a broken thumbnail.
  it('still detects a PDF behind a signature query string', async () => {
    const { isPdfRef } = await import('./signedStorage')
    expect(isPdfRef('https://x/storage/v1/object/sign/receipts/a.pdf?token=eyJ.x')).toBe(true)
  })

  it('does not misclassify images', async () => {
    const { isPdfRef } = await import('./signedStorage')
    expect(isPdfRef(PUBLIC_RECEIPT)).toBe(false)
    expect(isPdfRef(SIGNED_RECEIPT)).toBe(false)
  })
})

describe('signStorageUrls', () => {
  it('signs refs keyed by their original stored value', async () => {
    const { signStorageUrls } = await import('./signedStorage')
    const out = await signStorageUrls('receipts', [PUBLIC_RECEIPT])
    expect(out[PUBLIC_RECEIPT]).toContain('/object/sign/')
  })

  it('passes foreign URLs through untouched', async () => {
    const { signStorageUrls } = await import('./signedStorage')
    const out = await signStorageUrls('receipts', [GDRIVE])
    expect(out[GDRIVE]).toBe(GDRIVE)
  })

  // The bucket is private: the stored value is a dead link, so handing it back
  // as a "fallback" would render a broken image and hide the real failure.
  it('omits a ref it could not sign, rather than falling back to the stored value', async () => {
    createSignedUrls.mockResolvedValueOnce({ data: [], error: null } as never)
    const { signStorageUrls } = await import('./signedStorage')
    const out = await signStorageUrls('receipts', [PUBLIC_RECEIPT])
    expect(out[PUBLIC_RECEIPT]).toBeUndefined()
  })
})
