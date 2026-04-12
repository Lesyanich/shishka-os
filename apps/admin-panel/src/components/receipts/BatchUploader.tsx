import { useCallback, useRef, useState } from 'react'
import { AlertCircle, ImagePlus, Loader2, Trash2, Upload, UploadCloud } from 'lucide-react'
import type { OcrModel, BatchProcessResult, InboxInsert } from '../../hooks/useReceiptInbox'
import { useRole } from '../../contexts/RoleContext'
import { MAX_FILE_SIZE, ACCEPT, compressImage, uploadToStorage } from './upload-helpers'

/* ────────────────────────── Constants ────────────────────────── */

const ROLE_TO_UPLOADER: Record<string, string> = {
  lesia: 'Lesia',
  bas: 'Bas',
  chef: 'Admin',
}

const MODEL_OPTIONS: { value: OcrModel; label: string }[] = [
  { value: 'gemini-flash', label: 'Gemini Flash' },
  { value: 'gemini-flash-lite', label: 'Flash Lite' },
  { value: 'gemini-3-flash', label: 'Gemini 3 Flash' },
  { value: 'gemini-pro', label: 'Gemini Pro' },
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'claude-sonnet', label: 'Sonnet' },
  { value: 'claude-haiku', label: 'Haiku' },
]

function getStoredModel(): OcrModel {
  const v = localStorage.getItem('receipt-ocr-model')
  if (v && v !== 'claude-sub' && MODEL_OPTIONS.some((o) => o.value === v)) return v as OcrModel
  return 'gemini-flash'
}

type BatchStep = 'idle' | 'compressing' | 'uploading' | 'analyzing' | 'done' | 'error'

interface DroppedFile {
  file: File
  previewUrl: string
  id: string
}

/* ────────────────────────── Props ────────────────────────── */

interface BatchUploaderProps {
  onBatchProcess: (photoUrls: string[], uploadedBy: string, model: OcrModel) => Promise<BatchProcessResult>
  onInsert: (payload: InboxInsert) => Promise<string | null>
}

/* ────────────────────────── Component ────────────────────────── */

export function BatchUploader({ onBatchProcess, onInsert }: BatchUploaderProps) {
  const { role } = useRole()
  const uploadedBy = ROLE_TO_UPLOADER[role] || 'Admin'

  const [files, setFiles] = useState<DroppedFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [step, setStep] = useState<BatchStep>('idle')
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [progress, setProgress] = useState('')
  const [autoSort, setAutoSort] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

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

  const clearAll = useCallback(() => {
    for (const f of files) if (f.previewUrl) URL.revokeObjectURL(f.previewUrl)
    setFiles([])
  }, [files])

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

  /* ── Upload files to storage (shared logic) ── */
  const uploadFiles = async (): Promise<string[] | null> => {
    setStep('compressing')
    setProgress(`Compressing ${files.length} files...`)
    const compressed = await Promise.all(files.map((f) => compressImage(f.file)))

    setStep('uploading')
    setProgress(`Uploading ${compressed.length} files...`)
    const results = await Promise.all(compressed.map((f, i) => uploadToStorage(f, i)))
    const photoUrls = results.filter((r): r is { url: string } => 'url' in r).map((r) => r.url)
    const uploadErrors = results.filter((r): r is { error: string } => 'error' in r)

    if (photoUrls.length === 0) {
      setStep('error')
      setToast({ type: 'err', msg: `Upload failed: ${uploadErrors[0]?.error ?? 'unknown'}` })
      return null
    }

    if (uploadErrors.length > 0) {
      setProgress(`Uploaded ${photoUrls.length}/${compressed.length} (${uploadErrors.length} failed)`)
    }

    return photoUrls
  }

  /* ── Upload only (no parse) ── */
  const handleUploadOnly = async () => {
    if (files.length === 0) {
      setToast({ type: 'err', msg: 'Add at least one photo' })
      return
    }

    setToast(null)
    try {
      const photoUrls = await uploadFiles()
      if (!photoUrls) return

      // Create one inbox row with all photos, status = pending
      const err = await onInsert({
        uploaded_by: uploadedBy,
        photo_urls: photoUrls,
      })

      if (err) {
        setStep('error')
        setToast({ type: 'err', msg: err })
        return
      }

      setStep('done')
      setToast({ type: 'ok', msg: `Uploaded ${photoUrls.length} file(s) — parse later from the list` })
      setProgress('')
      for (const f of files) if (f.previewUrl) URL.revokeObjectURL(f.previewUrl)
      setFiles([])
    } catch (err) {
      setStep('error')
      setToast({ type: 'err', msg: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  /* ── Upload & process ── */
  const handleProcess = async () => {
    if (files.length === 0) {
      setToast({ type: 'err', msg: 'Add at least one photo' })
      return
    }

    setToast(null)
    try {
      const photoUrls = await uploadFiles()
      if (!photoUrls) return

      localStorage.setItem('receipt-ocr-model', model)

      if (autoSort && photoUrls.length > 1) {
        // Batch process with triage
        setStep('analyzing')
        setProgress(`Analyzing ${photoUrls.length} images — grouping receipts...`)

        const result = await onBatchProcess(photoUrls, uploadedBy, model)
        if (!result.ok) {
          setStep('error')
          setToast({ type: 'err', msg: result.error || 'Batch processing failed' })
          return
        }

        setStep('done')
        const successGroups = result.groups?.filter((g) => !g.error) || []
        const errorGroups = result.groups?.filter((g) => g.error) || []
        const costStr = result.total_cost_usd ? ` ($${result.total_cost_usd.toFixed(3)})` : ''
        const timeStr = result.duration_ms ? ` in ${(result.duration_ms / 1000).toFixed(1)}s` : ''

        let msg = `Created ${successGroups.length} receipt(s) from ${result.total_images} images${costStr}${timeStr}`
        if (errorGroups.length > 0) msg += `. ${errorGroups.length} failed.`
        setToast({ type: successGroups.length > 0 ? 'ok' : 'err', msg })
      } else {
        // Single receipt mode — insert + parse inline (no triage needed)
        setStep('analyzing')
        setProgress('Parsing receipt...')

        const err = await onInsert({
          uploaded_by: uploadedBy,
          photo_urls: photoUrls,
        })
        if (err) {
          setStep('error')
          setToast({ type: 'err', msg: err })
          return
        }
        setStep('done')
        setToast({ type: 'ok', msg: 'Uploaded! Parsing will start from the list.' })
      }

      setProgress('')
      for (const f of files) if (f.previewUrl) URL.revokeObjectURL(f.previewUrl)
      setFiles([])
    } catch (err) {
      setStep('error')
      setToast({ type: 'err', msg: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  const isProcessing = step === 'compressing' || step === 'uploading' || step === 'analyzing'

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60">
      <div className="space-y-3 px-4 py-4">
        {/* ── Drop zone ── */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !isProcessing && inputRef.current?.click()}
          className={`flex min-h-[100px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed transition-all ${
            isDragging
              ? 'border-blue-500 bg-blue-500/[0.07]'
              : 'border-slate-600 bg-slate-900/40 hover:border-blue-500/60 hover:bg-slate-900/60'
          } ${isProcessing ? 'pointer-events-none opacity-60' : ''}`}
        >
          {isProcessing ? (
            <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
          ) : (
            <Upload className={`h-6 w-6 ${isDragging ? 'text-blue-400' : 'text-slate-500'}`} />
          )}
          <p className="text-xs text-slate-400">
            {isProcessing
              ? progress
              : <>Drop receipt photos or <span className="font-medium text-blue-400 underline underline-offset-2">browse</span></>
            }
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

        {/* ── Thumbnail grid ── */}
        {files.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">{files.length} file(s)</span>
              <button
                type="button"
                onClick={clearAll}
                disabled={isProcessing}
                className="text-[10px] text-rose-400 hover:text-rose-300 disabled:opacity-40"
              >
                Clear all
              </button>
            </div>
            <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 md:grid-cols-10">
              {files.map((df) => (
                <div
                  key={df.id}
                  className="group/thumb relative aspect-square overflow-hidden rounded-lg border border-slate-700/50 bg-slate-800/70"
                >
                  {df.previewUrl ? (
                    <img src={df.previewUrl} alt={df.file.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <ImagePlus className="h-4 w-4 text-slate-600" />
                    </div>
                  )}
                  {!isProcessing && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeFile(df.id) }}
                      className="absolute right-0.5 top-0.5 rounded bg-black/70 p-0.5 text-rose-400 opacity-0 transition group-hover/thumb:opacity-100 hover:text-rose-300"
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Controls ── */}
        <div className="flex items-center gap-3">
          {/* Auto-sort toggle */}
          <label className="flex cursor-pointer items-center gap-1.5 select-none">
            <input
              type="checkbox"
              checked={autoSort}
              onChange={(e) => setAutoSort(e.target.checked)}
              disabled={isProcessing}
              className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-0 focus:ring-offset-0 disabled:opacity-40"
            />
            <span className="text-[11px] text-slate-400">Auto-sort by supplier</span>
          </label>

          {/* Model selector */}
          <select
            value={model}
            onChange={(e) => setModel(e.target.value as OcrModel)}
            disabled={isProcessing}
            className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-[11px] text-slate-300 outline-none focus:border-blue-500 disabled:opacity-40"
          >
            {MODEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <div className="flex-1" />

          {/* Upload only */}
          <button
            type="button"
            onClick={handleUploadOnly}
            disabled={isProcessing || files.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-[11px] font-medium text-slate-300 transition hover:border-slate-500 hover:text-slate-100 disabled:opacity-30"
          >
            <UploadCloud className="h-3.5 w-3.5" />
            Upload only
          </button>

          {/* Upload & process */}
          <button
            type="button"
            onClick={handleProcess}
            disabled={isProcessing || files.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-[11px] font-medium text-white transition hover:bg-emerald-500 disabled:opacity-30"
          >
            {isProcessing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            {isProcessing ? 'Processing...' : `Upload & process${files.length > 0 ? ` (${files.length})` : ''}`}
          </button>
        </div>

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
    </div>
  )
}
