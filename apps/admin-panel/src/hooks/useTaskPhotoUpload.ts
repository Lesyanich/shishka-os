import { useCallback, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface TaskPhotoUploadResult {
  ok: boolean
  /** In-bucket path — the value that gets persisted. Not a public URL; the
   *  bucket is private and viewers sign the path at render time. MC 6d860866. */
  path?: string
  error?: string
}

const BUCKET = 'task-photos'
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 8 * 1024 * 1024 // 8 MB — phone-camera photos run larger than dish refs

/**
 * Uploads a single task-report photo to the private `task-photos` bucket and
 * returns its in-bucket PATH. Tasks keep a *list* of photos (a report can have
 * several), so each upload writes a unique timestamped path and never
 * overwrites — the caller appends the returned path to `staff_tasks.photo_urls`.
 *
 * Path: `{taskId}/{timestamp}.{ext}`.
 *
 * Deliberately not getPublicUrl(): the bucket is private, and a public link
 * persisted in the DB would outlive any policy we set on it. Viewers mint a
 * short-lived signed URL from the path (lib/taskPhotoUrls.ts). MC 6d860866.
 */
export function useTaskPhotoUpload() {
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = useCallback(
    async (file: File, taskId: string): Promise<TaskPhotoUploadResult> => {
      setError(null)
      if (!ALLOWED_MIME.includes(file.type)) {
        const msg = `Unsupported type: ${file.type}. Use JPEG/PNG/WebP.`
        setError(msg)
        return { ok: false, error: msg }
      }
      if (file.size > MAX_BYTES) {
        const msg = `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 8 MB.`
        setError(msg)
        return { ok: false, error: msg }
      }

      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
      const path = `${taskId}/${Date.now()}.${ext}`

      setIsUploading(true)
      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: false, cacheControl: '3600' })
      if (uploadErr) {
        setIsUploading(false)
        setError(uploadErr.message)
        return { ok: false, error: uploadErr.message }
      }

      setIsUploading(false)
      return { ok: true, path }
    },
    [],
  )

  return { upload, isUploading, error }
}
