import { db, googleVisionKey } from "./supabase.ts"

const RECEIPTS_BUCKET = "receipts"

function uint8ToBase64(bytes: Uint8Array): string {
  const CHUNK = 32768
  let binary = ""
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

/**
 * Extract the in-bucket path from a stored receipt reference.
 * Accepts a full public URL, a signed URL, or a bare path.
 * Returns null for a foreign host (legacy Google Drive links in expense_ledger),
 * which has to be fetched over plain HTTP because no Supabase credential applies.
 */
export function toReceiptPath(ref: string): string | null {
  if (!ref) return null
  if (/^https?:\/\//i.test(ref)) {
    const m = ref.match(/\/storage\/v1\/object\/(?:public|sign)\/receipts\/([^?]+)/)
    if (!m) return null
    try {
      return decodeURIComponent(m[1])
    } catch {
      return m[1]
    }
  }
  return ref.replace(/^receipts\//, "")
}

/**
 * Download a receipt image and return it base64-encoded for the vision/LLM APIs.
 *
 * Takes a stored reference in ANY shape — full public URL, signed URL, or bare
 * path — and pulls the bytes with the service-role client, which bypasses RLS
 * and does not care whether the bucket is public.
 *
 * This used to be a bare `fetch(url)` with no credentials, which worked only
 * because the receipts bucket was public. It is now credentialed, so it keeps
 * working after the bucket is flipped to private (T3, MC 69395970) — and it is
 * what lets the write side start storing bare paths, which a plain fetch()
 * could not resolve at all.
 *
 * Backward compatible on purpose: the existing 318 stored full URLs resolve
 * exactly as before, just via storage.download() instead of HTTP.
 */
export async function downloadImageAsBase64(ref: string): Promise<{ data: string; mediaType: string }> {
  const path = toReceiptPath(ref)

  if (path) {
    const { data: blob, error } = await db.storage.from(RECEIPTS_BUCKET).download(path)
    if (error || !blob) {
      throw new Error(`Failed to download receipt "${path}": ${error?.message ?? "empty body"}`)
    }
    const buf = await blob.arrayBuffer()
    return {
      data: uint8ToBase64(new Uint8Array(buf)),
      mediaType: (blob.type || "image/jpeg").split(";")[0].trim(),
    }
  }

  // Foreign host — no Supabase credential applies, so plain HTTP it is.
  const resp = await fetch(ref)
  if (!resp.ok) throw new Error(`Failed to download image: ${resp.status} ${ref}`)
  const buf = await resp.arrayBuffer()
  const contentType = resp.headers.get("content-type") || "image/jpeg"
  return { data: uint8ToBase64(new Uint8Array(buf)), mediaType: contentType.split(";")[0].trim() }
}

export async function extractTextViaGCV(imageBase64: string): Promise<string> {
  const visionKey = googleVisionKey
  if (!visionKey) throw new Error("GOOGLE_API_KEY_VISAI not configured for Vision API")

  const resp = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${visionKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{
          image: { content: imageBase64 },
          features: [{ type: "TEXT_DETECTION" }],
        }],
      }),
    },
  )

  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Vision API ${resp.status}: ${err}`)
  }

  const body = await resp.json()
  const annotation = body.responses?.[0]
  if (annotation?.error) {
    throw new Error(`Vision API error: ${annotation.error.message}`)
  }
  return annotation?.fullTextAnnotation?.text ?? ""
}
