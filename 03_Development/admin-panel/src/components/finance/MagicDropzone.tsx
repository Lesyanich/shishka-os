import { useCallback, useRef, useState } from 'react'
import { ImagePlus, Loader2, Sparkles, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'

/* ────────────────────────── Types ────────────────────────── */

interface DroppedFile {
  file: File
  previewUrl: string
  id: string
}

export interface MagicDropzoneProps {
  /** Called after upload — passes the first 3 URLs mapped to supplier/bank/tax slots */
  onUrlsReady: (urls: { supplier?: string; bank?: string; tax?: string }) => void
}

/* ────────────────────────── Compression ────────────────────────── */

const MAX_DIM = 1024
const JPEG_QUALITY = 0.8

async function compressImage(file: File): Promise<File> {
  // PDFs pass through
  if (file.type === 'application/pdf') return file

  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)

      let { width, height } = img
      if (width > MAX_DIM || height > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / width, MAX_DIM / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Canvas not supported'))
      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('Compression failed'))
          const compressed = new File([blob], file.name.replace(/\.\w+$/, '.jpg'), {
            type: 'image/jpeg',
          })
          resolve(compressed)
        },
        'image/jpeg',
        JPEG_QUALITY,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }
    img.src = url
  })
}

/* ────────────────────────── Upload helper ────────────────────────── */

async function uploadToStorage(file: File, index: number): Promise<string | null> {
  const prefix = index === 0 ? 'supplier' : index === 1 ? 'bank' : 'tax'
  const ext = file.name.split('.').pop() ?? 'jpg'
  const filePath = `${prefix}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`

  const { error } = await supabase.storage
    .from('receipts')
    .upload(filePath, file, { upsert: false })

  if (error) {
    console.error(`[MagicDropzone] upload error for ${prefix}`, error)
    return null
  }

  const { data } = supabase.storage.from('receipts').getPublicUrl(filePath)
  return data.publicUrl
}

/* ────────────────────────── Component ────────────────────────── */

const ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

export function MagicDropzone({ onUrlsReady }: MagicDropzoneProps) {
  const [files, setFiles] = useState<DroppedFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming).filter((f) => ACCEPT.includes(f.type))
    const newDropped: DroppedFile[] = arr.map((f) => ({
      file: f,
      previewUrl: f.type.startsWith('image/') ? URL.createObjectURL(f) : '',
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    }))
    setFiles((prev) => [...prev, ...newDropped])
  }, [])

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const removed = prev.find((f) => f.id === id)
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl)
      return prev.filter((f) => f.id !== id)
    })
  }, [])

  /* ── Drag handlers ── */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => setIsDragging(false), [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
    },
    [addFiles],
  )

  /* ── "Analyze with AI" — mock flow ── */
  const handleAnalyze = async () => {
    if (files.length === 0) return

    setIsAnalyzing(true)
    setToast(null)

    // Mock AI delay (2 seconds)
    await new Promise((r) => setTimeout(r, 2000))
    setToast('AI API not connected yet — uploading files directly')

    // Compress + upload
    try {
      const compressed = await Promise.all(files.map((f) => compressImage(f.file)))
      const urls = await Promise.all(compressed.map((f, i) => uploadToStorage(f, i)))

      const result: { supplier?: string; bank?: string; tax?: string } = {}
      if (urls[0]) result.supplier = urls[0]
      if (urls[1]) result.bank = urls[1]
      if (urls[2]) result.tax = urls[2]

      onUrlsReady(result)

      // Clear files
      for (const f of files) {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl)
      }
      setFiles([])
    } catch (err) {
      console.error('[MagicDropzone] upload failed', err)
      setToast('Upload failed — check console')
    } finally {
      setIsAnalyzing(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition ${
          isDragging
            ? 'border-emerald-400 bg-emerald-500/10'
            : 'border-slate-700 bg-slate-900/30 hover:border-slate-600 hover:bg-slate-900/50'
        }`}
      >
        <ImagePlus className={`h-8 w-8 ${isDragging ? 'text-emerald-400' : 'text-slate-600'}`} />
        <p className="text-xs text-slate-500">
          Drop receipts here or <span className="text-emerald-400 underline">browse</span>
        </p>
        <p className="text-[10px] text-slate-600">JPEG, PNG, WebP, PDF (max 5 MB each)</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT.join(',')}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {/* Thumbnail grid */}
      {files.length > 0 && (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {files.map((df) => (
            <div
              key={df.id}
              className="group relative aspect-square overflow-hidden rounded-lg border border-slate-700 bg-slate-800"
            >
              {df.previewUrl ? (
                <img
                  src={df.previewUrl}
                  alt={df.file.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-500">
                  PDF
                </div>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  removeFile(df.id)
                }}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-rose-400 opacity-0 transition group-hover:opacity-100"
              >
                <Trash2 className="h-3 w-3" />
              </button>
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 text-center">
                <span className="block truncate text-[8px] text-slate-300">{df.file.name}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Analyze button + toast */}
      {files.length > 0 && (
        <button
          type="button"
          onClick={handleAnalyze}
          disabled={isAnalyzing}
          className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-violet-500/60 bg-violet-500/15 text-xs font-medium text-violet-200 hover:bg-violet-500/25 disabled:opacity-50"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Analyzing receipt with AI...
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" />
              Analyze with AI ({files.length} file{files.length !== 1 ? 's' : ''})
            </>
          )}
        </button>
      )}

      {toast && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          {toast}
        </div>
      )}
    </div>
  )
}
