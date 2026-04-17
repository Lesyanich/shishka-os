import { useCallback, useRef, useState } from 'react'
import { ImagePlus, Star, Trash2, Loader2, X } from 'lucide-react'
import type { NomImage } from '../../hooks/useNomenclatureImages'

interface ImageGalleryProps {
  images: NomImage[]
  isLoading: boolean
  onUpload: (files: File[]) => Promise<{ ok: boolean; error?: string }>
  onRemove: (imageId: string) => Promise<{ ok: boolean; error?: string }>
  onSetPrimary: (imageId: string) => Promise<{ ok: boolean; error?: string }>
}

export function ImageGallery({ images, isLoading, onUpload, onRemove, onSetPrimary }: ImageGalleryProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (arr.length === 0) return
    setIsUploading(true)
    setError(null)
    const result = await onUpload(arr)
    if (!result.ok) setError(result.error ?? 'Upload failed')
    setIsUploading(false)
  }, [onUpload])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  const handleRemove = useCallback(async (id: string) => {
    const result = await onRemove(id)
    if (!result.ok) setError(result.error ?? 'Delete failed')
  }, [onRemove])

  const handleSetPrimary = useCallback(async (id: string) => {
    const result = await onSetPrimary(id)
    if (!result.ok) setError(result.error ?? 'Set primary failed')
  }, [onSetPrimary])

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-xs text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading photos...
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {error && (
        <div className="rounded border border-rose-800/50 bg-rose-950/30 px-3 py-1.5 text-[11px] text-rose-300">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-rose-400 hover:text-rose-200">
            <X className="inline h-3 w-3" />
          </button>
        </div>
      )}

      {/* Thumbnail strip */}
      <div className="flex flex-wrap gap-2">
        {images.map((img) => (
          <div
            key={img.id}
            className={`group relative h-20 w-20 overflow-hidden rounded-lg border-2 transition ${
              img.is_primary
                ? 'border-emerald-500'
                : 'border-slate-700 hover:border-slate-500'
            }`}
          >
            <button
              type="button"
              onClick={() => setPreviewUrl(img.url)}
              className="h-full w-full"
            >
              <img
                src={img.url}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </button>

            {/* Primary badge */}
            {img.is_primary && (
              <span className="absolute left-1 top-1 rounded bg-emerald-600/90 px-1 py-0.5 text-[8px] font-bold text-white">
                PRIMARY
              </span>
            )}

            {/* Hover actions */}
            <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 bg-gradient-to-t from-black/80 to-transparent p-1 opacity-0 transition group-hover:opacity-100">
              {!img.is_primary && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleSetPrimary(img.id) }}
                  className="rounded bg-slate-800/80 p-1 text-amber-400 hover:bg-slate-700"
                  title="Set as primary"
                >
                  <Star className="h-3 w-3" />
                </button>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleRemove(img.id) }}
                className="rounded bg-slate-800/80 p-1 text-rose-400 hover:bg-slate-700"
                title="Delete photo"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}

        {/* Upload zone */}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          disabled={isUploading}
          className={`flex h-20 w-20 flex-col items-center justify-center rounded-lg border-2 border-dashed transition ${
            isDragging
              ? 'border-emerald-500 bg-emerald-500/10'
              : 'border-slate-700 bg-slate-800/50 hover:border-slate-500 hover:bg-slate-800'
          } ${isUploading ? 'opacity-50' : ''}`}
        >
          {isUploading ? (
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          ) : (
            <>
              <ImagePlus className="h-5 w-5 text-slate-500" />
              <span className="mt-1 text-[9px] text-slate-500">Add</span>
            </>
          )}
        </button>

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {/* Lightbox preview */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setPreviewUrl(null)}
        >
          <button
            type="button"
            onClick={() => setPreviewUrl(null)}
            className="absolute right-4 top-4 rounded-full bg-slate-800/80 p-2 text-slate-300 hover:bg-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={previewUrl}
            alt=""
            className="max-h-[80vh] max-w-[90vw] rounded-lg object-contain"
          />
        </div>
      )}
    </div>
  )
}
