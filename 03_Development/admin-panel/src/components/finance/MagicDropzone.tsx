import { useCallback, useRef, useState } from 'react'
import { ImagePlus, Loader2, Sparkles, Trash2, Upload } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { ParsedReceipt, ReceiptUrls } from '../../types/receipt'

/* ────────────────────────── Types ────────────────────────── */

interface DroppedFile {
  file: File
  previewUrl: string
  id: string
}

export interface MagicDropzoneProps {
  /** Called after upload — passes the first 3 URLs mapped to supplier/bank/tax slots */
  onUrlsReady: (urls: ReceiptUrls) => void
  /** Called when AI parse-receipts Edge Function returns structured data + all image URLs */
  onAiResult?: (result: ParsedReceipt, urls: ReceiptUrls, imageUrls: string[]) => void
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
  // Neutral prefix — AI classification determines document type, not upload order
  const ext = file.name.split('.').pop() ?? 'jpg'
  const filePath = `img/${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}.${ext}`

  const { error } = await supabase.storage
    .from('receipts')
    .upload(filePath, file, { upsert: false })

  if (error) {
    console.error(`[MagicDropzone] upload error for file ${index}`, error)
    return null
  }

  const { data } = supabase.storage.from('receipts').getPublicUrl(filePath)
  return data.publicUrl
}

/* ────────────────────────── Component ────────────────────────── */

const ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

export function MagicDropzone({ onUrlsReady, onAiResult }: MagicDropzoneProps) {
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

  /* ── "Analyze with AI" — real Edge Function flow ── */
  const handleAnalyze = async () => {
    if (files.length === 0) return

    setIsAnalyzing(true)
    setToast(null)

    try {
      // Step 1: Compress + upload to Storage
      const compressed = await Promise.all(files.map((f) => compressImage(f.file)))
      const uploadedUrls = await Promise.all(
        compressed.map((f, i) => uploadToStorage(f, i)),
      )
      const imageUrls = uploadedUrls.filter((u): u is string => u !== null)

      if (imageUrls.length === 0) {
        setToast('No images uploaded — cannot analyze')
        return
      }

      // Step 2: If AI callback provided, call Edge Function + classify documents
      if (onAiResult) {
        const { data, error } = await supabase.functions.invoke(
          'parse-receipts',
          { body: { image_urls: imageUrls } },
        )

        if (error) throw error
        if (data?.error) throw new Error(data.error)

        const parsed = data as ParsedReceipt

        // Step 3: Build receiptUrls from AI document classification
        const receiptUrls: ReceiptUrls = {}
        const docs = parsed.documents

        if (docs) {
          if (docs.supplier_receipt_index != null && imageUrls[docs.supplier_receipt_index]) {
            receiptUrls.supplier = imageUrls[docs.supplier_receipt_index]
          }
          if (docs.bank_slip_index != null && imageUrls[docs.bank_slip_index]) {
            receiptUrls.bank = imageUrls[docs.bank_slip_index]
          }
          if (docs.tax_invoice_index != null && imageUrls[docs.tax_invoice_index]) {
            receiptUrls.tax = imageUrls[docs.tax_invoice_index]
          }
        } else {
          // Fallback: positional mapping (backward compat)
          if (imageUrls[0]) receiptUrls.supplier = imageUrls[0]
          if (imageUrls[1]) receiptUrls.bank = imageUrls[1]
          if (imageUrls[2]) receiptUrls.tax = imageUrls[2]
        }

        onUrlsReady(receiptUrls)
        onAiResult(parsed, receiptUrls, imageUrls)

        // Clear files on success
        for (const f of files) {
          if (f.previewUrl) URL.revokeObjectURL(f.previewUrl)
        }
        setFiles([])
      } else {
        // No AI callback — legacy positional path
        const receiptUrls: ReceiptUrls = {}
        if (imageUrls[0]) receiptUrls.supplier = imageUrls[0]
        if (imageUrls[1]) receiptUrls.bank = imageUrls[1]
        if (imageUrls[2]) receiptUrls.tax = imageUrls[2]

        onUrlsReady(receiptUrls)
        setToast('AI API not connected yet — files uploaded directly')
        for (const f of files) {
          if (f.previewUrl) URL.revokeObjectURL(f.previewUrl)
        }
        setFiles([])
      }
    } catch (err) {
      console.error('[MagicDropzone] AI analysis failed', err)
      setToast(
        `AI analysis failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      )
    } finally {
      setIsAnalyzing(false)
    }
  }

  const hasFiles = files.length > 0

  return (
    <div className="space-y-3">
      {/* ── Drop Zone ── */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className="group relative cursor-pointer overflow-hidden"
      >
        {/* Animated gradient border */}
        <div
          className={`absolute -inset-[1px] rounded-2xl transition-opacity duration-500 ${
            isDragging ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'
          } animate-border-flow`}
          style={{ padding: '1px' }}
        />

        {/* Inner container */}
        <div
          className={`relative flex min-h-[140px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed transition-all duration-300 ${
            isDragging
              ? 'border-indigo-400/60 bg-indigo-500/[0.07] shadow-[inset_0_0_60px_rgba(99,102,241,0.06)]'
              : 'border-slate-700/60 bg-slate-900/40 hover:border-slate-600/80 hover:bg-slate-900/60'
          }`}
        >
          {/* Subtle grid pattern background */}
          <div
            className="pointer-events-none absolute inset-0 rounded-2xl opacity-[0.03]"
            style={{
              backgroundImage:
                'radial-gradient(circle, #94a3b8 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />

          {/* Scanning effect while analyzing */}
          {isAnalyzing && (
            <div className="scan-effect pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" />
          )}

          <div
            className={`relative rounded-xl p-3 transition-all duration-300 ${
              isDragging
                ? 'bg-indigo-500/15 shadow-lg shadow-indigo-500/10'
                : 'bg-slate-800/50 group-hover:bg-slate-800/80 group-hover:shadow-md group-hover:shadow-slate-900/50'
            }`}
          >
            {isAnalyzing ? (
              <Loader2 className="h-7 w-7 animate-spin text-indigo-400" />
            ) : (
              <Upload
                className={`h-7 w-7 transition-colors duration-200 ${
                  isDragging ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-400'
                }`}
              />
            )}
          </div>

          {isAnalyzing ? (
            <div className="relative text-center">
              <p className="text-sm font-medium tracking-wide text-indigo-300">
                Analyzing receipt...
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                AI is extracting line items and classifying them
              </p>
            </div>
          ) : (
            <div className="relative text-center">
              <p className="text-sm text-slate-400">
                Drop receipts here or{' '}
                <span className="font-medium text-indigo-400 underline decoration-indigo-400/30 underline-offset-2 transition-colors group-hover:text-indigo-300 group-hover:decoration-indigo-300/50">
                  browse
                </span>
              </p>
              <p className="mt-1 text-[11px] tracking-wide text-slate-600">
                JPEG &middot; PNG &middot; WebP &middot; PDF &middot; max 5 MB
              </p>
            </div>
          )}
        </div>

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

      {/* ── Thumbnail Grid ── */}
      {hasFiles && (
        <div className="stagger-children grid grid-cols-4 gap-2.5 sm:grid-cols-6">
          {files.map((df) => (
            <div
              key={df.id}
              className="group/thumb relative aspect-square overflow-hidden rounded-xl border border-slate-700/50 bg-slate-800/70 shadow-sm transition-all duration-200 hover:border-slate-600 hover:shadow-md hover:shadow-slate-900/50"
            >
              {df.previewUrl ? (
                <img
                  src={df.previewUrl}
                  alt={df.file.name}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover/thumb:scale-105"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1">
                  <ImagePlus className="h-5 w-5 text-slate-600" />
                  <span className="text-[10px] font-medium tracking-wider text-slate-500">
                    PDF
                  </span>
                </div>
              )}

              {/* Remove button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  removeFile(df.id)
                }}
                className="absolute right-1.5 top-1.5 rounded-lg bg-black/70 p-1 text-rose-400 opacity-0 backdrop-blur-sm transition-all duration-200 hover:bg-black/90 hover:text-rose-300 group-hover/thumb:opacity-100"
              >
                <Trash2 className="h-3 w-3" />
              </button>

              {/* Filename bar */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent px-2 pb-1.5 pt-4">
                <span className="block truncate text-[9px] font-medium tracking-wide text-slate-300">
                  {df.file.name}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Analyze Button ── */}
      {hasFiles && !isAnalyzing && (
        <button
          type="button"
          onClick={handleAnalyze}
          disabled={isAnalyzing}
          className="animate-fade-in-up group/btn relative w-full overflow-hidden rounded-xl border border-indigo-500/40 bg-gradient-to-r from-indigo-500/[0.12] via-violet-500/[0.12] to-indigo-500/[0.12] px-4 py-2.5 text-sm font-medium tracking-wide text-indigo-200 shadow-sm transition-all duration-300 hover:border-indigo-400/60 hover:from-indigo-500/20 hover:via-violet-500/20 hover:to-indigo-500/20 hover:shadow-md hover:shadow-indigo-500/10 disabled:opacity-50"
        >
          {/* Shimmer effect on hover */}
          <div className="absolute inset-0 translate-x-[-200%] bg-gradient-to-r from-transparent via-white/[0.04] to-transparent transition-transform duration-700 group-hover/btn:translate-x-[200%]" />

          <span className="relative inline-flex items-center gap-2">
            <Sparkles className="h-4 w-4 transition-transform duration-200 group-hover/btn:rotate-12" />
            Analyze with AI
            <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-xs tabular-nums text-indigo-300">
              {files.length} file{files.length !== 1 ? 's' : ''}
            </span>
          </span>
        </button>
      )}

      {/* ── Toast Messages ── */}
      {toast && (
        <div className="animate-fade-in-up flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 shadow-sm">
          <div className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
          <p className="text-xs leading-relaxed text-amber-300/90">{toast}</p>
        </div>
      )}
    </div>
  )
}
