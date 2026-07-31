import { useCallback, useState } from 'react'
import { supabase } from '../lib/supabase'

export const STAFF_PAYMENT_QR_BUCKET = 'staff-payment-qr'

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 8 * 1024 * 1024 // matches the bucket file_size_limit (mig 399)

export interface PaymentQrResult {
  ok: boolean
  path?: string
  error?: string
}

/**
 * Upload / replace / remove one employee's payment QR.
 *
 * The bucket is PRIVATE and its policies are per-row — read is the owner or the
 * employee themselves, write is the owner only (migration 399). That is
 * deliberately tighter than the other private buckets: a PromptPay QR carries
 * the payee's phone number or national ID as its payload, so being able to
 * fetch the image is being able to read their identifier.
 *
 * Ownership is derived from the object path, `{staffId}/{file}`, so the storage
 * policy and the `staff.payment_qr_path` column cannot disagree about who a QR
 * belongs to.
 *
 * The stored value is a bare path, never a URL — signed links expire, so
 * persisting one would store a guaranteed 404. Render through
 * `useSignedStorageUrls(STAFF_PAYMENT_QR_BUCKET, ...)`.
 */
export function useStaffPaymentQr() {
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = useCallback(
    async (staffId: string, file: File): Promise<PaymentQrResult> => {
      setError(null)

      if (!ALLOWED_MIME.includes(file.type)) {
        const msg = `Unsupported type: ${file.type || 'unknown'}. Use JPEG, PNG or WebP.`
        setError(msg)
        return { ok: false, error: msg }
      }
      if (file.size > MAX_BYTES) {
        const msg = `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 8 MB.`
        setError(msg)
        return { ok: false, error: msg }
      }

      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
      const path = `${staffId}/${Date.now()}.${ext}`

      setIsUploading(true)

      // Read the previous path BEFORE pointing the row at the new one, so a
      // replace can clean up after itself instead of leaving the old QR
      // readable in the bucket forever.
      const { data: prev } = await supabase
        .from('staff')
        .select('payment_qr_path')
        .eq('id', staffId)
        .maybeSingle()

      const { error: uploadErr } = await supabase.storage
        .from(STAFF_PAYMENT_QR_BUCKET)
        .upload(path, file, { upsert: false, cacheControl: '3600' })

      if (uploadErr) {
        setIsUploading(false)
        setError(uploadErr.message)
        return { ok: false, error: uploadErr.message }
      }

      const { error: updateErr } = await supabase
        .from('staff')
        .update({ payment_qr_path: path })
        .eq('id', staffId)

      if (updateErr) {
        // The row still points at the old QR, so the orphan is the new upload.
        await supabase.storage.from(STAFF_PAYMENT_QR_BUCKET).remove([path])
        setIsUploading(false)
        setError(updateErr.message)
        return { ok: false, error: updateErr.message }
      }

      const oldPath = (prev as { payment_qr_path: string | null } | null)?.payment_qr_path
      if (oldPath && oldPath !== path) {
        await supabase.storage.from(STAFF_PAYMENT_QR_BUCKET).remove([oldPath])
      }

      setIsUploading(false)
      return { ok: true, path }
    },
    [],
  )

  const remove = useCallback(async (staffId: string, path: string | null) => {
    setError(null)
    const { error: updateErr } = await supabase
      .from('staff')
      .update({ payment_qr_path: null })
      .eq('id', staffId)

    if (updateErr) {
      setError(updateErr.message)
      return { ok: false, error: updateErr.message }
    }
    if (path) {
      await supabase.storage.from(STAFF_PAYMENT_QR_BUCKET).remove([path])
    }
    return { ok: true }
  }, [])

  const setNote = useCallback(async (staffId: string, note: string) => {
    const { error: updateErr } = await supabase
      .from('staff')
      .update({ payment_note: note.trim() === '' ? null : note.trim() })
      .eq('id', staffId)

    if (updateErr) {
      setError(updateErr.message)
      return { ok: false, error: updateErr.message }
    }
    return { ok: true }
  }, [])

  return { upload, remove, setNote, isUploading, error }
}
