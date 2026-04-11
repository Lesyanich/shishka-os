import { useCallback, useRef, useState } from 'react'
import { AlertCircle, ChevronDown, ImagePlus, Loader2, Send, Trash2, Upload } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { InboxInsert, OcrModel } from '../../hooks/useReceiptInbox'

/* ────────────────────────── Constants ────────────────────────── */

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB
const WEBP_QUALITY = 0.65
const ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const UPLOADERS = ['Bas', 'Lesia', 'Admin'] as const

const MODEL_OPTIONS: { value: OcrModel; label: string }[] = [
  { value: 'gemini-flash', label: 'Gemini Flash ($0.008)' },
  { value: 'gemini-flash-lite', label: 'Flash Lite ($0.003)' },
  { value: 'gemini-3-flash', label: 'Gemini 3 Flash ($0.01)' },
  { value: 'gemini-pro', label: 'Gemini Pro ($0.04)' },
  { value: 'gpt-4o', label: 'GPT-4o ($0.03)' },
  { value: 'claude-sonnet', label: 'Sonnet ($0.07)' },
  { value: 'claude-haiku', label: 'Haiku ($0.04)' },
  { value: 'claude-sub', label: 'Agent queue ($0)' },
]

function getStoredModel(): OcrModel {
  const v = localStorage.getItem('receipt-ocr-model')
  if (v === 'gemini-flash' || v === 'gemini-flash-lite' || v === 'gemini-3-flash' || v === 'gemini-pro' || v === 'claude-sonnet' || v === 'claude-haiku' || v === 'gpt-4o' || v === 'claude-sub') return v
  return 'gemini-flash'
}

/* ────────────────────────── Helpers ────────────────────────── */

interface DroppedFile {
  file: File
  previewUrl: string
  id: string
}

async function compressImage(file: File): Promise<File> {
  // PDFs can't be compressed — return as-is
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

  // Try WebP first, fallback to JPEG if unsupported
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

async function uploadToStorage(
  file: File,
  index: number,
): Promise<{ url: string } | { error: string }> {
  const ext = file.name.split('.').pop() ?? 'webp'
  const filePath = `inbox/${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}.${ext}`

  const { error } = await supabase.storage
    .from('receipts')
    .upload(filePath, file, { upsert: false })

  if (error) {
    console.error('[InboxUploader] upload error', error)
    return { error: error.message }
  }

  const { data } = supabase.storage.from('receipts').getPublicUrl(filePath)
  return { url: data.publicUrl }
}

/* ────────────────────────── Props ────────────────────────── */

interface InboxUploaderProps {
  onSubmit: (payload: InboxInsert) => Promise<string | null>
  onParse?: (inboxId: string, model: OcrModel) => Promise<{ ok: boolean; error?: string }>
}

/* ────────────────────────── Component ────────────────────────── */

export function InboxUploader({ onSubmit, onParse }: InboxUploaderProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [files, setFiles] = useState<DroppedFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Form fields
  const [uploadedBy, setUploadedBy] = useState<string>('')
  const [receiptDate, setReceiptDate] = useState('')
  const [supplierHint, setSupplierHint] = useState('')
  const [amountHint, setAmountHint] = useState('')
  const [notes, setNotes] = useState('')
  const [model, setModel] = useState<OcrModel>(getStoredModel)

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming).filter((f) => {
      if (!ACCEPT.includes(f.type)) {
        setToast({ type: 'err', msg: `"${f.name}" — unsupported format` })
        return false
      }
      if (f.size > MAX_FILE_SIZE) {
        setToast({ type: 'err', msg: `"${f.name}" exceeds 5 MB limit` })
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

  const resetForm = () => {
    for (const f of files) if (f.previewUrl) URL.revokeObjectURL(f.previewUrl)
    setFiles([])
    setUploadedBy('')
    setReceiptDate('')
    setSupplierHint('')
    setAmountHint('')
    setNotes('')
  }

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

  /* ── Submit ── */
  const handleSubmit = async () => {
    if (!uploadedBy) {
      setToast({ type: 'err', msg: 'Select who is uploading' })
      return
    }
    if (files.length === 0) {
      setToast({ type: 'err', msg: 'Add at least one photo' })
      return
    }

    setIsUploading(true)
    setToast(null)

    try {
      const compressed = await Promise.all(files.map((f) => compressImage(f.file)))
      const results = await Promise.all(compressed.map((f, i) => uploadToStorage(f, i)))
      const photoUrls = results.filter((r): r is { url: string } => 'url' in r).map((r) => r.url)
      const errors = results.filter((r): r is { error: string } => 'error' in r)

      if (photoUrls.length === 0) {
        setToast({ type: 'err', msg: `Upload failed: ${errors[0]?.error ?? 'unknown'}` })
        return
      }

      const modelUsed = model === 'claude-sub' ? 'claude-subscription' : null
      const payload: InboxInsert = {
        uploaded_by: uploadedBy,
        photo_urls: photoUrls,
        receipt_date: receiptDate || null,
        supplier_hint: supplierHint || null,
        amount_hint: amountHint ? Number(amountHint) : null,
        notes: notes || null,
        model_used: modelUsed,
      }

      const err = await onSubmit(payload)
      if (err) {
        setToast({ type: 'err', msg: err })
        return
      }

      if (model !== 'claude-sub' && onParse) {
        setToast({ type: 'ok', msg: `Uploaded! Parsing via ${model}...` })
        resetForm()
      } else {
        setToast({ type: 'ok', msg: model === 'claude-sub' ? 'Queued for agent' : 'Uploaded!' })
        resetForm()
      }
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-800/30"
      >
        <div className="flex items-center gap-2">
          <Upload className="h-4 w-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-100">Upload Receipt</span>
        </div>
        <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && <div className="space-y-4 border-t border-slate-800 px-4 pb-4 pt-3">
      {/* ── Drop zone ── */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex min-h-[96px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed transition-all ${
          isDragging
            ? 'border-blue-500 bg-blue-500/[0.07]'
            : 'border-slate-600 bg-slate-900/40 hover:border-blue-500/60 hover:bg-slate-900/60'
        }`}
      >
        {isUploading ? (
          <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
        ) : (
          <Upload className={`h-6 w-6 ${isDragging ? 'text-blue-400' : 'text-slate-500'}`} />
        )}
        <p className="text-xs text-slate-400">
          Drop photos or <span className="font-medium text-blue-400 underline underline-offset-2">browse</span>
        </p>
        <p className="text-[10px] text-slate-600">JPEG · PNG · WebP · PDF · max 5 MB</p>
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

      {/* ── Thumbnail grid ── */}
      {files.length > 0 && (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {files.map((df) => (
            <div
              key={df.id}
              className="group/thumb relative aspect-square overflow-hidden rounded-lg border border-slate-700/50 bg-slate-800/70"
            >
              {df.previewUrl ? (
                <img src={df.previewUrl} alt={df.file.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <ImagePlus className="h-5 w-5 text-slate-600" />
                </div>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeFile(df.id) }}
                className="absolute right-1 top-1 rounded-md bg-black/70 p-0.5 text-rose-400 opacity-0 transition group-hover/thumb:opacity-100 hover:text-rose-300"
              >
                <Trash2 className="h-3 w-3" />
              </button>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-1 pb-1 pt-3">
                <span className="block truncate text-[8px] text-slate-300">{df.file.name}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Form fields ── */}
      <div className="grid grid-cols-2 gap-3">
        {/* Who */}
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Uploaded by <span className="text-rose-400">*</span>
          </label>
          <select
            value={uploadedBy}
            onChange={(e) => setUploadedBy(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 outline-none focus:border-blue-500"
          >
            <option value="">Select...</option>
            {UPLOADERS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>

        {/* Date */}
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Receipt date
          </label>
          <input
            type="date"
            value={receiptDate}
            onChange={(e) => setReceiptDate(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 outline-none focus:border-blue-500"
          />
        </div>

        {/* Supplier */}
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Supplier
          </label>
          <input
            type="text"
            value={supplierHint}
            onChange={(e) => setSupplierHint(e.target.value)}
            placeholder="Makro, Tops..."
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 outline-none focus:border-blue-500"
          />
        </div>

        {/* Amount + Model on same row */}
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Amount, ฿
          </label>
          <input
            type="number"
            value={amountHint}
            onChange={(e) => setAmountHint(e.target.value)}
            placeholder="฿"
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 outline-none focus:border-blue-500"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Notes
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional..."
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 outline-none focus:border-blue-500"
          />
        </div>

        {/* Model — compact dropdown */}
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
            OCR Model
          </label>
          <select
            value={model}
            onChange={(e) => { setModel(e.target.value as OcrModel); localStorage.setItem('receipt-ocr-model', e.target.value) }}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 outline-none focus:border-blue-500"
          >
            {MODEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Submit ── */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isUploading || files.length === 0 || !uploadedBy}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600"
      >
        {isUploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
        {model === 'claude-sub' ? 'Queue for agent' : 'Upload & parse'}
      </button>

      {/* ── Toast ── */}
      {toast && (
        <div
          className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
            toast.type === 'ok'
              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
              : 'border-rose-500/20 bg-rose-500/10 text-rose-300'
          }`}
        >
          {toast.type === 'err' && <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          <span>{toast.msg}</span>
        </div>
      )}
      </div>}
    </div>
  )
}
