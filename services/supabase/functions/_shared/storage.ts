import { db } from "./supabase.ts"

/* ═══════════════════════════════════════════════════════════════════════════
   Storage refs for PRIVATE buckets, server side.

   The DB holds a stable reference — a bare in-bucket path for anything written
   since the cutover, or a full public URL on older rows. Never a signed URL:
   those expire, so they can never be persisted.

   NOTE: _shared/gcv.ts carries an equivalent receipts-specific copy
   (toReceiptPath + a service-role download). It is deployed and working; it is
   deliberately NOT refactored onto this module, because that would mean
   redeploying the OCR path for no functional gain. Fold it in next time that
   function is touched for a real reason.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Extract the in-bucket path from a stored reference.
 * Accepts a full public URL, a signed URL, or a bare path.
 * Returns null for a foreign host — nothing of ours applies to it.
 */
export function toStoragePath(bucket: string, ref: string): string | null {
  if (!ref) return null

  if (/^https?:\/\//i.test(ref)) {
    const m = ref.match(
      new RegExp(`/storage/v1/object/(?:public|sign)/${bucket}/([^?]+)`),
    )
    if (!m) return null
    try {
      return decodeURIComponent(m[1])
    } catch {
      return m[1]
    }
  }

  return ref.replace(new RegExp(`^${bucket}/`), "")
}

/**
 * Mint a signed URL for a stored reference, using the service-role client.
 * Returns null if the ref is foreign or signing fails — callers must handle it
 * rather than passing a dead link on.
 */
export async function signStorageRef(
  bucket: string,
  ref: string,
  expiresInSeconds: number,
): Promise<string | null> {
  const path = toStoragePath(bucket, ref)
  if (!path) return null

  const { data, error } = await db.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds)

  if (error || !data?.signedUrl) {
    console.error(`[storage] could not sign ${bucket} ref "${path}":`, error?.message)
    return null
  }
  return data.signedUrl
}
