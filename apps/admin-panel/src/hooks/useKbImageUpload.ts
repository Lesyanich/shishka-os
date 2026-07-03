import { useCallback, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface KbImageUploadResult {
  ok: boolean
  url?: string
  error?: string
}

const BUCKET = 'kb-images'
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_BYTES = 8 * 1024 * 1024 // 8 MB — matches the bucket file_size_limit (mig 345)

/**
 * Uploads a single image to the public `kb-images` bucket and returns its public
 * URL for embedding in a handbook page (`![alt](url)`). Mirrors
 * {@link useTaskPhotoUpload}; writes never overwrite (unique timestamped path).
 * Bucket write is owner-only via RLS, so a non-owner upload fails with an error.
 *
 * Path: `kb-images/{pageId|unsorted}/{timestamp}.{ext}`.
 */
export function useKbImageUpload() {
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = useCallback(
    async (file: File, pageId?: string | null): Promise<KbImageUploadResult> => {
      setError(null)
      if (!ALLOWED_MIME.includes(file.type)) {
        const msg = `Unsupported type: ${file.type}. Use JPEG/PNG/WebP/GIF.`
        setError(msg)
        return { ok: false, error: msg }
      }
      if (file.size > MAX_BYTES) {
        const msg = `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 8 MB.`
        setError(msg)
        return { ok: false, error: msg }
      }

      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
      const path = `${pageId ?? 'unsorted'}/${Date.now()}.${ext}`

      setIsUploading(true)
      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: false, cacheControl: '3600' })
      if (uploadErr) {
        setIsUploading(false)
        setError(uploadErr.message)
        return { ok: false, error: uploadErr.message }
      }

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
      setIsUploading(false)
      return { ok: true, url: data.publicUrl }
    },
    [],
  )

  return { upload, isUploading, error }
}
