import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface NomImage {
  id: string
  nomenclature_id: string
  url: string
  storage_path: string | null
  sort_order: number
  is_primary: boolean
  uploaded_at: string
}

interface UseNomenclatureImagesResult {
  images: NomImage[]
  isLoading: boolean
  primaryUrl: string | null
  upload: (files: File[]) => Promise<{ ok: boolean; error?: string }>
  remove: (imageId: string) => Promise<{ ok: boolean; error?: string }>
  setPrimary: (imageId: string) => Promise<{ ok: boolean; error?: string }>
  refetch: () => void
}

const BUCKET = 'nomenclature-photos'
const MAX_DIMENSION = 1600

/** Resize image to max 1600px and convert to WebP via Canvas API */
async function processImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const scale = MAX_DIMENSION / Math.max(width, height)
        width = Math.round(width * scale)
        height = Math.round(height * scale)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('Canvas not supported')); return }
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob)
          else reject(new Error('Failed to convert to WebP'))
        },
        'image/webp',
        0.85,
      )
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = URL.createObjectURL(file)
  })
}

export function useNomenclatureImages(nomenclatureId: string | null): UseNomenclatureImagesResult {
  const [images, setImages] = useState<NomImage[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const fetchImages = useCallback(async () => {
    if (!nomenclatureId) { setImages([]); return }
    setIsLoading(true)
    const { data, error } = await supabase
      .from('nomenclature_images')
      .select('id, nomenclature_id, url, storage_path, sort_order, is_primary, uploaded_at')
      .eq('nomenclature_id', nomenclatureId)
      .order('sort_order', { ascending: true })
      .order('uploaded_at', { ascending: true })

    if (error) {
      console.error('[useNomenclatureImages] fetch error', error)
    } else {
      setImages((data ?? []) as NomImage[])
    }
    setIsLoading(false)
  }, [nomenclatureId])

  useEffect(() => { fetchImages() }, [fetchImages])

  const primaryUrl = images.find((i) => i.is_primary)?.url ?? images[0]?.url ?? null

  const upload = useCallback(async (files: File[]): Promise<{ ok: boolean; error?: string }> => {
    if (!nomenclatureId) return { ok: false, error: 'No item selected' }

    const hasPrimary = images.some((i) => i.is_primary)

    for (let idx = 0; idx < files.length; idx++) {
      const file = files[idx]
      try {
        const blob = await processImage(file)
        const filename = `${crypto.randomUUID()}.webp`
        const storagePath = `${nomenclatureId}/${filename}`

        const { error: uploadErr } = await supabase.storage
          .from(BUCKET)
          .upload(storagePath, blob, { contentType: 'image/webp', upsert: false })

        if (uploadErr) return { ok: false, error: uploadErr.message }

        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)
        const publicUrl = urlData.publicUrl

        const { error: insertErr } = await supabase
          .from('nomenclature_images')
          .insert({
            nomenclature_id: nomenclatureId,
            url: publicUrl,
            storage_path: storagePath,
            sort_order: images.length + idx,
            is_primary: !hasPrimary && idx === 0,
          })

        if (insertErr) return { ok: false, error: insertErr.message }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }

    await fetchImages()
    return { ok: true }
  }, [nomenclatureId, images, fetchImages])

  const remove = useCallback(async (imageId: string): Promise<{ ok: boolean; error?: string }> => {
    const img = images.find((i) => i.id === imageId)
    if (!img) return { ok: false, error: 'Image not found' }

    // Delete from Storage if it's a managed file
    if (img.storage_path) {
      const { error: storageErr } = await supabase.storage
        .from(BUCKET)
        .remove([img.storage_path])
      if (storageErr) console.warn('[useNomenclatureImages] storage delete warning', storageErr)
    }

    const { error: deleteErr } = await supabase
      .from('nomenclature_images')
      .delete()
      .eq('id', imageId)

    if (deleteErr) return { ok: false, error: deleteErr.message }

    // If we deleted the primary, promote the next image
    if (img.is_primary) {
      const remaining = images.filter((i) => i.id !== imageId)
      if (remaining.length > 0) {
        await supabase
          .from('nomenclature_images')
          .update({ is_primary: true })
          .eq('id', remaining[0].id)
      }
    }

    await fetchImages()
    return { ok: true }
  }, [images, fetchImages])

  const setPrimary = useCallback(async (imageId: string): Promise<{ ok: boolean; error?: string }> => {
    if (!nomenclatureId) return { ok: false, error: 'No item selected' }

    // Unset current primary
    const { error: unsetErr } = await supabase
      .from('nomenclature_images')
      .update({ is_primary: false })
      .eq('nomenclature_id', nomenclatureId)
      .eq('is_primary', true)

    if (unsetErr) return { ok: false, error: unsetErr.message }

    // Set new primary
    const { error: setErr } = await supabase
      .from('nomenclature_images')
      .update({ is_primary: true })
      .eq('id', imageId)

    if (setErr) return { ok: false, error: setErr.message }

    await fetchImages()
    return { ok: true }
  }, [nomenclatureId, fetchImages])

  return { images, isLoading, primaryUrl, upload, remove, setPrimary, refetch: fetchImages }
}
