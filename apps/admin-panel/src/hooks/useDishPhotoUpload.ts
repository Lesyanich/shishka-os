import { useCallback, useState } from 'react'
import { supabase } from '../lib/supabase'

export type DishPhotoRole = 'customer' | 'assembler' | 'kitchen'

export interface PhotoUploadResult {
  ok: boolean
  url?: string
  error?: string
}

const BUCKET = 'nomenclature-photos'
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 3 * 1024 * 1024 // 3 MB

/** Uploads a dish photo to the nomenclature-photos bucket and returns the
 * public URL.
 *
 * Path: `{nomenclatureId}/{role}.{ext}` — lives under the dish's folder
 * (matching the imported-menu `{dishId}/...` convention) with the role as the
 * basename so customer/assembler/kitchen photos don't overwrite each other.
 * Upsert overwrites the prior photo for that (dish, role) pair. Caller is
 * responsible for writing the returned URL to the appropriate column
 * (customer → nomenclature.image_url, assembler → dish_card.assembler_photo_url,
 * kitchen → pf_pack_card.kitchen_photo_url).
 */
export function useDishPhotoUpload() {
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = useCallback(
    async (
      file: File,
      role: DishPhotoRole,
      nomenclatureId: string,
    ): Promise<PhotoUploadResult> => {
      setError(null)
      if (!ALLOWED_MIME.includes(file.type)) {
        const msg = `Unsupported type: ${file.type}. Use JPEG/PNG/WebP.`
        setError(msg)
        return { ok: false, error: msg }
      }
      if (file.size > MAX_BYTES) {
        const msg = `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 3 MB.`
        setError(msg)
        return { ok: false, error: msg }
      }

      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'webp'
      const path = `${nomenclatureId}/${role}.${ext}`

      setIsUploading(true)
      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, {
          upsert: true,
          cacheControl: '3600',
        })
      if (uploadErr) {
        setIsUploading(false)
        setError(uploadErr.message)
        return { ok: false, error: uploadErr.message }
      }

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
      // Cache-bust: append timestamp so refreshed photo replaces the old one
      // in browser caches without changing the canonical URL we persist.
      const url = `${data.publicUrl}?t=${Date.now()}`

      setIsUploading(false)
      return { ok: true, url }
    },
    [],
  )

  const remove = useCallback(
    async (
      role: DishPhotoRole,
      nomenclatureId: string,
      ext: string,
    ): Promise<{ ok: boolean; error?: string }> => {
      const path = `${nomenclatureId}/${role}.${ext}`
      const { error: rmErr } = await supabase.storage
        .from(BUCKET)
        .remove([path])
      if (rmErr) {
        setError(rmErr.message)
        return { ok: false, error: rmErr.message }
      }
      return { ok: true }
    },
    [],
  )

  return { upload, remove, isUploading, error }
}
