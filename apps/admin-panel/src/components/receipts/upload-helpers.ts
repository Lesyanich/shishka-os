import { supabase } from '../../lib/supabase'

export const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB
export const WEBP_QUALITY = 0.65
export const ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
export const UPLOADERS = ['Bas', 'Lesia', 'Admin'] as const

export async function compressImage(file: File): Promise<File> {
  if (file.type === 'application/pdf') return file

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    const url = URL.createObjectURL(file)
    el.onload = () => { URL.revokeObjectURL(url); resolve(el) }
    el.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Failed to load: ${file.name}`)) }
    el.src = url
  })

  const { naturalWidth: w, naturalHeight: h } = img
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0)

  let blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY)
  })
  let ext = 'webp'
  let mime = 'image/webp'

  if (!blob || blob.type !== 'image/webp') {
    blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', WEBP_QUALITY)
    })
    ext = 'jpg'
    mime = 'image/jpeg'
  }

  if (!blob) throw new Error(`Compression failed: ${file.name}`)

  const baseName = file.name.replace(/\.[^.]+$/, '')
  return new File([blob], `${baseName}.${ext}`, { type: mime })
}

export async function uploadToStorage(
  file: File,
  index: number,
): Promise<{ url: string } | { error: string }> {
  const ext = file.name.split('.').pop() ?? 'webp'
  const filePath = `inbox/${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}.${ext}`

  const { error } = await supabase.storage
    .from('receipts')
    .upload(filePath, file, { upsert: false })

  if (error) {
    console.error('[upload] error', error)
    return { error: error.message }
  }

  const { data } = supabase.storage.from('receipts').getPublicUrl(filePath)
  return { url: data.publicUrl }
}
