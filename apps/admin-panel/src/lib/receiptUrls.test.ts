import { describe, it, expect, vi } from 'vitest'

// receiptUrls imports the supabase client at module load; stub it so these
// pure-function tests don't spin up a real client.
vi.mock('./supabase', () => ({
  supabase: { storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) } },
}))

const PUBLIC = 'https://qcqgtcsjoacuktcewpvo.supabase.co/storage/v1/object/public/receipts/inbox/1783762412489_0_if8o90.jpg'
const SIGNED = 'https://qcqgtcsjoacuktcewpvo.supabase.co/storage/v1/object/sign/receipts/inbox/1783762412489_0_if8o90.jpg?token=eyJhbGci.abc-123'
const SIGNED_PDF = 'https://qcqgtcsjoacuktcewpvo.supabase.co/storage/v1/object/sign/receipts/inbox/1782290390370_0_t78vti.pdf?token=eyJhbGci.abc-123'
const GDRIVE = 'https://drive.google.com/file/d/1AbCdEf/view'

describe('toReceiptPath', () => {
  it('extracts the path from a stored public URL', async () => {
    const { toReceiptPath } = await import('./receiptUrls')
    expect(toReceiptPath(PUBLIC)).toBe('inbox/1783762412489_0_if8o90.jpg')
  })

  it('extracts the path from an already-signed URL, dropping the token', async () => {
    const { toReceiptPath } = await import('./receiptUrls')
    expect(toReceiptPath(SIGNED)).toBe('inbox/1783762412489_0_if8o90.jpg')
  })

  it('passes a bare path through and strips a redundant bucket prefix', async () => {
    const { toReceiptPath } = await import('./receiptUrls')
    expect(toReceiptPath('inbox/x.jpg')).toBe('inbox/x.jpg')
    expect(toReceiptPath('receipts/inbox/x.jpg')).toBe('inbox/x.jpg')
  })

  it('decodes percent-encoded paths', async () => {
    const { toReceiptPath } = await import('./receiptUrls')
    expect(
      toReceiptPath('https://x.supabase.co/storage/v1/object/public/receipts/inbox/a%20b.jpg'),
    ).toBe('inbox/a b.jpg')
  })

  it('returns null for a foreign host so legacy Google Drive links are never signed', async () => {
    const { toReceiptPath } = await import('./receiptUrls')
    expect(toReceiptPath(GDRIVE)).toBeNull()
  })

  it('returns null for empty input', async () => {
    const { toReceiptPath } = await import('./receiptUrls')
    expect(toReceiptPath('')).toBeNull()
  })
})

describe('isPdfReceipt', () => {
  it('detects a plain .pdf, case-insensitively', async () => {
    const { isPdfReceipt } = await import('./receiptUrls')
    expect(isPdfReceipt('inbox/x.pdf')).toBe(true)
    expect(isPdfReceipt('inbox/X.PDF')).toBe(true)
  })

  // The regression this helper exists for: a signed URL ends in `?token=…`, so
  // a naive endsWith('.pdf') classifies every signed PDF as an image and renders
  // it into an <img> as a broken thumbnail.
  it('still detects a PDF when the URL carries a signature query string', async () => {
    const { isPdfReceipt } = await import('./receiptUrls')
    expect(isPdfReceipt(SIGNED_PDF)).toBe(true)
  })

  it('does not misclassify images', async () => {
    const { isPdfReceipt } = await import('./receiptUrls')
    expect(isPdfReceipt(PUBLIC)).toBe(false)
    expect(isPdfReceipt(SIGNED)).toBe(false)
  })
})

describe('signReceiptUrls', () => {
  it('passes foreign URLs through untouched', async () => {
    const { signReceiptUrls } = await import('./receiptUrls')
    const out = await signReceiptUrls([GDRIVE])
    expect(out[GDRIVE]).toBe(GDRIVE)
  })

  it('falls back to the original value when signing yields nothing', async () => {
    // The mocked client returns an empty data array — the fallback must keep the
    // stored URL, which still resolves while the bucket is public.
    const { signReceiptUrls } = await import('./receiptUrls')
    const out = await signReceiptUrls([PUBLIC])
    expect(out[PUBLIC]).toBe(PUBLIC)
  })
})
