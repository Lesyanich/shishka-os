import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'

/* ═══════════════════════════════════════════════════════════════════════════
   Signed-URL resolution for PRIVATE storage buckets.

   The pattern, once, for every private bucket — receipts (MC 69395970) and
   task-photos (MC 6d860866). A duplicated signing helper is how the two drift
   apart and one of them quietly regresses.

   The DB never holds a URL. It holds a stable reference — a bare storage path
   for anything written since the cutover, and, on older rows, a full public URL
   left over from when the bucket was open. The browser mints a short-lived
   signed URL from that reference every time it renders. Signed URLs expire, so
   they can never be persisted; that is the whole point.

   A reference that cannot be signed resolves to null, NOT to the stored value.
   On a private bucket the stored value is a guaranteed 400, so handing it back
   as a "fallback" would flash a broken image on every load before the signature
   arrives, and bury genuine failures behind the same icon. Callers render a
   placeholder instead.

   Foreign references (e.g. the legacy Google Drive links still in
   expense_ledger) are passed through untouched — no credential of ours applies,
   and they never lived in our bucket.
   ═══════════════════════════════════════════════════════════════════════════ */

/** 1 hour. Only bounds how long a *leaked* link stays usable — the admin panel
 *  re-mints on every render, so this is invisible in normal use. */
export const SIGNED_URL_TTL_SECONDS = 60 * 60

/**
 * Extract the in-bucket path from a stored reference.
 * Accepts a full public URL, a signed URL, or a bare path.
 * Returns null for a foreign host, which must be passed through, never signed.
 */
export function toStoragePath(bucket: string, value: string): string | null {
  if (!value) return null

  if (/^https?:\/\//i.test(value)) {
    // Public:  /storage/v1/object/public/<bucket>/<path>
    // Signed:  /storage/v1/object/sign/<bucket>/<path>?token=...
    const m = value.match(
      new RegExp(`/storage/v1/object/(?:public|sign)/${bucket}/([^?]+)`),
    )
    if (!m) return null // external host — not ours
    try {
      return decodeURIComponent(m[1])
    } catch {
      return m[1]
    }
  }

  // Bare path already — tolerate a redundant bucket prefix.
  return value.replace(new RegExp(`^${bucket}/`), '')
}

/** True for a reference that points at a PDF.
 *  Query strings are stripped first: a signed URL ends in `?token=…`, so a
 *  naive endsWith('.pdf') would classify every signed PDF as an image and
 *  render it into an <img> as a broken thumbnail. */
export function isPdfRef(value: string): boolean {
  return value.split('?')[0].toLowerCase().endsWith('.pdf')
}

/**
 * Mint signed URLs for a batch of stored references.
 * Returns a map keyed by the ORIGINAL value, so callers keep using the stored
 * string as their identity and only swap what they put in `src`/`href`.
 *
 * A reference that fails to sign is ABSENT from the map — never mapped back to
 * its dead stored value. See the header note.
 */
export async function signStorageUrls(
  bucket: string,
  values: readonly string[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const pathByValue = new Map<string, string>()

  for (const value of values) {
    if (!value) continue
    const path = toStoragePath(bucket, value)
    if (path) pathByValue.set(value, path)
    else out[value] = value // foreign / unrecognised — pass through
  }

  const paths = [...new Set(pathByValue.values())]
  if (paths.length === 0) return out

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)

  const signedByPath = new Map<string, string>()
  if (error) {
    console.error(`[signedStorage] createSignedUrls failed for ${bucket}`, error)
  } else if (data) {
    for (const item of data) {
      if (item.signedUrl && item.path) signedByPath.set(item.path, item.signedUrl)
    }
  }

  for (const [value, path] of pathByValue) {
    const signed = signedByPath.get(path)
    if (signed) out[value] = signed
    else console.error(`[signedStorage] could not sign ${bucket} ref`, path)
  }
  return out
}

export interface SignedUrls {
  /**
   * Stored value -> URL safe to put in src/href.
   * null while the signature is in flight, or if signing failed — render a
   * placeholder, never a dead link.
   */
  resolve: (value: string) => string | null
  /** False until the first mint resolves. */
  ready: boolean
}

/**
 * Mint signed URLs for the given stored references.
 * `resolve()` returns null until a signature exists, so callers must handle the
 * pending/failed case explicitly rather than rendering a broken image.
 */
export function useSignedStorageUrls(
  bucket: string,
  values: readonly (string | null | undefined)[],
): SignedUrls {
  const clean = useMemo(
    () => values.filter((v): v is string => typeof v === 'string' && v.length > 0),
    [values],
  )
  // Stable dep: re-mint only when the actual set of references changes.
  const key = clean.join(' ')

  const [map, setMap] = useState<Record<string, string>>({})
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (clean.length === 0) {
      setMap({})
      setReady(true)
      return
    }
    let cancelled = false
    setReady(false)
    signStorageUrls(bucket, clean).then((m) => {
      if (cancelled) return
      setMap(m)
      setReady(true)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucket, key])

  return useMemo(
    () => ({ resolve: (value: string) => map[value] ?? null, ready }),
    [map, ready],
  )
}
