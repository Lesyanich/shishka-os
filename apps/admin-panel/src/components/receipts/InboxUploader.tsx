import { useCallback, useRef, useState } from 'react'
import { AlertCircle, Brain, ImagePlus, Loader2, Send, Trash2, Upload, Zap } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { InboxInsert, OcrModel } from '../../hooks/useReceiptInbox'

/* ────────────────────────── Constants ────────────────────────── */

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB
const WEBP_QUALITY = 0.65
const ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const UPLOADERS = ['Bas', 'Lesia', 'Admin'] as const

const MODEL_OPTIONS: { value: OcrModel; label: string; desc: string }[] = [
  { value: 'gemini-flash', label: 'Gemini Flash', desc: '~$0.004/чек, лучший' },
  { value: 'gemini-pro', label: 'Gemini Pro', desc: '~$0.04/чек' },
  { value: 'gpt-4o', label: 'GPT-4o', desc: '~$0.03/чек, быстрый' },
  { value: 'claude-sonnet', label: 'Claude Sonnet', desc: '~$0.07/чек' },
  { value: 'claude-sub', label: 'Подписка', desc: 'Очередь для агента, $0' },
]

function getStoredModel(): OcrModel {
  const v = localStorage.getItem('receipt-ocr-model')
  if (v === 'gemini-flash' || v === 'gemini-pro' || v === 'claude-sonnet' || v === 'gpt-4o' || v === 'claude-sub') return v
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
      setToast({ type: 'err', msg: 'Выберите, кто загружает' })
      return
    }
    if (files.length === 0) {
      setToast({ type: 'err', msg: 'Добавьте хотя бы одно фото' })
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
        setToast({ type: 'err', msg: `Ошибка загрузки: ${errors[0]?.error ?? 'unknown'}` })
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
        // Get the newly inserted row ID — it's the latest one
        // The insert callback already refetched, but we need the ID
        // Fire Edge Function in background — Realtime will update status
        setToast({ type: 'ok', msg: `Чек загружен! Распознавание через ${model === 'claude-sonnet' ? 'Claude Sonnet' : 'GPT-4o'}...` })
        resetForm()
      } else {
        setToast({ type: 'ok', msg: model === 'claude-sub' ? 'Чек загружен в очередь для агента' : 'Чек загружен!' })
        resetForm()
      }
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <h3 className="text-sm font-semibold text-slate-100">Загрузить чек</h3>

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
          Перетащите фото или <span className="font-medium text-blue-400 underline underline-offset-2">выберите</span>
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
            Кто загружает <span className="text-rose-400">*</span>
          </label>
          <select
            value={uploadedBy}
            onChange={(e) => setUploadedBy(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 outline-none focus:border-blue-500"
          >
            <option value="">Выберите...</option>
            {UPLOADERS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>

        {/* Date */}
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Дата чека
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
            Поставщик
          </label>
          <input
            type="text"
            value={supplierHint}
            onChange={(e) => setSupplierHint(e.target.value)}
            placeholder="Makro, Tops..."
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 outline-none focus:border-blue-500"
          />
        </div>

        {/* Amount */}
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Сумма, ฿
          </label>
          <input
            type="number"
            value={amountHint}
            onChange={(e) => setAmountHint(e.target.value)}
            placeholder="฿"
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 outline-none focus:border-blue-500"
          />
        </div>

        {/* Notes — full width */}
        <div className="col-span-2">
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Комментарий
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Любые заметки..."
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* ── Model selector ── */}
      <div>
        <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
          Режим распознавания
        </label>
        <div className="grid grid-cols-3 gap-2">
          {MODEL_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { setModel(opt.value); localStorage.setItem('receipt-ocr-model', opt.value) }}
              className={`flex flex-col items-center gap-0.5 rounded-lg border px-2 py-2 text-center transition ${
                model === opt.value
                  ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                  : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'
              }`}
            >
              {opt.value === 'gemini-pro' && <Zap className="h-4 w-4" />}
              {opt.value === 'claude-sonnet' && <Brain className="h-4 w-4" />}
              {opt.value === 'gpt-4o' && <Zap className="h-4 w-4" />}
              {opt.value === 'claude-sub' && <Send className="h-4 w-4" />}
              <span className="text-[11px] font-medium">{opt.label}</span>
              <span className="text-[9px] text-slate-500">{opt.desc}</span>
            </button>
          ))}
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
        {model === 'claude-sub' ? 'В очередь для агента' : 'Загрузить и распознать'}
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
    </div>
  )
}
