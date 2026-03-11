import { useCallback, useEffect, useRef, useState } from 'react'
import { ImagePlus, Loader2, Sparkles, Trash2, Upload } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { ReceiptUrls } from '../../types/receipt'

/* ────────────────────────── Types ────────────────────────── */

interface DroppedFile {
  file: File
  previewUrl: string
  id: string
}

export interface MagicDropzoneProps {
  /** Called after upload — passes the first 3 URLs mapped to supplier/bank/tax slots */
  onUrlsReady: (urls: ReceiptUrls) => void
  /** Phase 4.14: Called when async job is created — parent subscribes via Realtime */
  onJobCreated?: (jobId: string, imageUrls: string[]) => void
  /** Whether an async job is currently being processed (controls pulsing UX) */
  isPending?: boolean
}

/* ────────────────────────── Constants ────────────────────────── */

// Phase 4.16: Smart Tiling — width-preserving compression + tiling for long receipts
const MAX_FILE_SIZE = 15 * 1024 * 1024  // 15 MB — raw camera photos (before processing)
const TILE_THRESHOLD = 2.5              // aspect ratio (h/w) above which we tile
const MAX_DIM = 2048                    // normal mode: scale to fit this square
const MIN_TILE_WIDTH = 1024             // tile mode: minimum width for Thai text readability
const TILE_ASPECT_RATIO = 1.5           // tile mode: max height:width per tile
const OVERLAP_RATIO = 0.1              // 10% overlap between tiles for item continuity
const JPEG_QUALITY = 0.85              // compression quality

/* ────────────────────── Smart Tiling Engine (Phase 4.16) ─────────── */

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`Failed to load image: ${file.name}`))
    }
    img.src = url
  })
}

function canvasToFile(canvas: HTMLCanvasElement, name: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('Canvas toBlob failed'))
        resolve(new File([blob], name, { type: 'image/jpeg' }))
      },
      'image/jpeg',
      JPEG_QUALITY,
    )
  })
}

/**
 * Phase 4.16: Width-Anchored Smart Tiling
 * - Normal images (aspect ≤ 2.5): compress to fit 2048×2048
 * - Tall receipts (aspect > 2.5): slice into tiles preserving width ≥ 1024px
 */
async function smartProcess(file: File): Promise<File[]> {
  const img = await loadImage(file)
  const { naturalWidth: w, naturalHeight: h } = img
  const aspect = h / w
  const baseName = file.name.replace(/\.[^.]+$/, '')

  if (aspect <= TILE_THRESHOLD) {
    // ── NORMAL MODE: standard compression ──
    const scale = Math.min(1, MAX_DIM / Math.max(w, h))
    const nw = Math.round(w * scale)
    const nh = Math.round(h * scale)

    const canvas = document.createElement('canvas')
    canvas.width = nw
    canvas.height = nh
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, nw, nh)

    const result = await canvasToFile(canvas, `${baseName}.jpg`)
    console.log(`[SmartTile] NORMAL: ${w}×${h} → ${nw}×${nh} (${(result.size / 1024).toFixed(0)} KB)`)
    return [result]
  }

  // ── TILE MODE: slice tall receipt into readable segments ──
  const tileW = Math.max(w, MIN_TILE_WIDTH)
  const scale = tileW / w
  const totalH = Math.round(h * scale)

  // Scale full image once into an intermediate canvas
  const fullCanvas = document.createElement('canvas')
  fullCanvas.width = tileW
  fullCanvas.height = totalH
  const fullCtx = fullCanvas.getContext('2d')!
  fullCtx.drawImage(img, 0, 0, tileW, totalH)

  // Tile geometry
  const tileH = Math.round(tileW * TILE_ASPECT_RATIO)
  const overlap = Math.round(tileH * OVERLAP_RATIO)
  const stride = tileH - overlap
  const numTiles = Math.ceil((totalH - tileH) / stride) + 1

  const tiles: File[] = []
  let y = 0
  while (y < totalH) {
    const endY = Math.min(y + tileH, totalH)
    const sliceH = endY - y

    const tileCanvas = document.createElement('canvas')
    tileCanvas.width = tileW
    tileCanvas.height = sliceH
    const tileCtx = tileCanvas.getContext('2d')!
    tileCtx.drawImage(fullCanvas, 0, y, tileW, sliceH, 0, 0, tileW, sliceH)

    const tileIndex = tiles.length + 1
    const tileName = `${baseName}_part_${tileIndex}_of_${numTiles}.jpg`
    const tileFile = await canvasToFile(tileCanvas, tileName)
    tiles.push(tileFile)

    if (endY >= totalH) break
    y += stride
  }

  console.log(
    `[SmartTile] TILED: ${w}×${h} (aspect ${aspect.toFixed(1)}) → ` +
    `${tiles.length} tiles of ${tileW}×~${tileH}, ` +
    `total ${(tiles.reduce((s, t) => s + t.size, 0) / 1024).toFixed(0)} KB`,
  )
  return tiles
}

/* ────────────────────────── Upload helper ────────────────────────── */

async function uploadToStorage(file: File, index: number): Promise<string | null> {
  // Phase 4.16: Preserve tile filename in storage path for AI sequence recognition
  const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_').toLowerCase()
  const filePath = `img/${Date.now()}_${index}_${safeName}`

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

const ACCEPT = ['image/jpeg', 'image/png', 'image/webp']

export function MagicDropzone({ onUrlsReady, onJobCreated, isPending }: MagicDropzoneProps) {
  const [files, setFiles] = useState<DroppedFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Phase 4.14: beforeunload guard while async job is active
  useEffect(() => {
    if (!isPending) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isPending])

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming).filter((f) => {
      if (!ACCEPT.includes(f.type)) return false
      if (f.size > MAX_FILE_SIZE) {
        setToast(`File "${f.name}" exceeds 15 MB limit (${(f.size / 1024 / 1024).toFixed(1)} MB)`)
        return false
      }
      return true
    })
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

  /* ── Phase 4.14: "Analyze with AI" — async fire-and-forget ── */
  const handleAnalyze = async () => {
    if (files.length === 0) return

    setIsUploading(true)
    setToast(null)

    try {
      // Step 1: Smart process each file — compress or tile (Phase 4.16)
      const allProcessed: File[] = []
      for (const f of files) {
        const processed = await smartProcess(f.file)
        allProcessed.push(...processed)
      }

      // Step 2: Upload processed files to Storage
      const uploadedUrls = await Promise.all(
        allProcessed.map((f, i) => uploadToStorage(f, i)),
      )
      const imageUrls = uploadedUrls.filter((u): u is string => u !== null)

      if (imageUrls.length === 0) {
        setToast('No images uploaded — cannot analyze')
        return
      }

      if (onJobCreated) {
        // Step 2: INSERT receipt_jobs row → get job ID
        const { data: job, error: insertErr } = await supabase
          .from('receipt_jobs')
          .insert({ image_urls: imageUrls })
          .select('id')
          .single()

        if (insertErr || !job) {
          throw new Error(insertErr?.message || 'Failed to create receipt job')
        }

        // Step 3: Fire Edge Function — don't await the result.
        // The Edge Function writes to receipt_jobs; frontend listens via Realtime.
        supabase.functions.invoke('parse-receipts', {
          body: { job_id: job.id, image_urls: imageUrls },
        }).catch((err) => {
          // Phase 4.14 Resilience: catch AbortError / network failures silently.
          // The Edge Function may still complete — DB has the job row.
          // Zombie cleanup RPC handles truly dead jobs after 5 min.
          if (err instanceof DOMException && err.name === 'AbortError') {
            console.warn('[MagicDropzone] Edge Function fetch aborted (user navigated away)')
          } else {
            console.error('[MagicDropzone] Edge Function invocation error (non-fatal)', err)
          }
        })

        // Step 4: Notify parent — Realtime subscription starts in FinanceManager
        onJobCreated(job.id, imageUrls)

        // Clear files — the job is in-flight
        for (const f of files) {
          if (f.previewUrl) URL.revokeObjectURL(f.previewUrl)
        }
        setFiles([])
      } else {
        // No async callback — legacy positional path (upload-only, no AI)
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
      console.error('[MagicDropzone] upload/job creation failed', err)
      setToast(
        `Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      )
    } finally {
      setIsUploading(false)
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

          {/* Scanning effect while uploading or AI pending */}
          {(isUploading || isPending) && (
            <div className="scan-effect pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" />
          )}

          <div
            className={`relative rounded-xl p-3 transition-all duration-300 ${
              isDragging
                ? 'bg-indigo-500/15 shadow-lg shadow-indigo-500/10'
                : 'bg-slate-800/50 group-hover:bg-slate-800/80 group-hover:shadow-md group-hover:shadow-slate-900/50'
            }`}
          >
            {isUploading || isPending ? (
              <Loader2 className="h-7 w-7 animate-spin text-indigo-400" />
            ) : (
              <Upload
                className={`h-7 w-7 transition-colors duration-200 ${
                  isDragging ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-400'
                }`}
              />
            )}
          </div>

          {isPending ? (
            <div className="relative text-center">
              <p className="text-sm font-medium tracking-wide text-indigo-300 animate-pulse">
                AI is reading your receipt...
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Extracting line items — this takes 30-60 seconds
              </p>
            </div>
          ) : isUploading ? (
            <div className="relative text-center">
              <p className="text-sm font-medium tracking-wide text-indigo-300">
                Uploading images...
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Processing and uploading images
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
                JPEG &middot; PNG &middot; WebP &middot; max 15 MB
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
      {hasFiles && !isUploading && !isPending && (
        <button
          type="button"
          onClick={handleAnalyze}
          disabled={isUploading || isPending}
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
