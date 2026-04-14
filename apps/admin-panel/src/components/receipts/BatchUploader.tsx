import { useCallback, useRef, useState } from 'react'
import { AlertCircle, ImagePlus, Loader2, Mic, MicOff, Trash2, Upload, UploadCloud, Send } from 'lucide-react'
import type { OcrModel, BatchProcessResult, InboxInsert } from '../../hooks/useReceiptInbox'
import { useAppRole } from '../../contexts/AppRoleContext'
import { MAX_FILE_SIZE, ACCEPT, compressImage, uploadToStorage } from './upload-helpers'
import { parseQuickExpense } from '../../utils/parseQuickExpense'

/* ────────────────────────── Speech Recognition ────────────────────────── */

type SpeechRecognitionInstance = {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  onresult: ((event: { results: SpeechRecognitionResultList }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

function getSpeechRecognition(): SpeechRecognitionInstance | null {
  const SR = window.SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition
  if (!SR) return null
  return new (SR as new () => SpeechRecognitionInstance)()
}

const hasSpeech = typeof window !== 'undefined' && !!(window.SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition)

/* ────────────────────────── Constants ────────────────────────── */

const ROLE_TO_UPLOADER: Record<string, string> = {
  owner: 'Admin',
  cook: 'Cook',
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
  onInsert: (payload: InboxInsert) => Promise<{ id?: string; error?: string }>
  onParse?: (inboxId: string, model: OcrModel) => Promise<{ ok: boolean; error?: string }>
}

/* ────────────────────────── Component ────────────────────────── */

export function BatchUploader({ onBatchProcess, onInsert, onParse }: BatchUploaderProps) {
  const { role, staffName } = useAppRole()
  const uploadedBy = staffName || ROLE_TO_UPLOADER[role] || 'Admin'

  const [files, setFiles] = useState<DroppedFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [step, setStep] = useState<BatchStep>('idle')
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [progress, setProgress] = useState('')
  const [oneReceipt, setOneReceipt] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const [model, setModel] = useState<OcrModel>(getStoredModel)

  // ── Note / voice input ──
  const [noteText, setNoteText] = useState('')
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const noteInputRef = useRef<HTMLInputElement>(null)

  const toggleMic = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }
    const recognition = getSpeechRecognition()
    if (!recognition) return
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'ru-RU'
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? ''
      setNoteText((prev) => (prev ? prev + ' ' + transcript : transcript).trim())
      setIsListening(false)
    }
    recognition.onerror = () => setIsListening(false)
    recognition.onend = () => setIsListening(false)
    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }, [isListening])

  /** Build insert payload with optional note hints */
  const buildInsert = useCallback((photoUrls: string[]): InboxInsert => {
    const base: InboxInsert = { uploaded_by: uploadedBy, photo_urls: photoUrls }
    const text = noteText.trim()
    if (!text) return base
    const parsed = parseQuickExpense(text)
    return {
      ...base,
      supplier_hint: parsed.supplier_hint,
      amount_hint: parsed.amount_hint,
      receipt_date: parsed.receipt_date,
      notes: text,
    }
  }, [noteText, uploadedBy])

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

  /* ── Note-only submit (no photos) ── */
  const handleNoteOnly = async () => {
    const text = noteText.trim()
    if (!text) return
    setStep('uploading')
    setToast(null)
    const payload = buildInsert([])
    const res = await onInsert(payload)
    if (res.error) {
      setStep('error')
      setToast({ type: 'err', msg: res.error })
    } else {
      const parsed = parseQuickExpense(text)
      const parts: string[] = []
      if (parsed.supplier_hint) parts.push(parsed.supplier_hint)
      if (parsed.amount_hint) parts.push(`฿${parsed.amount_hint.toLocaleString()}`)
      parts.push(parsed.receipt_date)
      setStep('done')
      setToast({ type: 'ok', msg: `Added: ${parts.join(' · ')}` })
      setNoteText('')
      noteInputRef.current?.focus()
    }
  }

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
  const handleUploadOnly = async (splitPerPhoto: boolean) => {
    if (files.length === 0) {
      setToast({ type: 'err', msg: 'Add at least one photo' })
      return
    }

    setToast(null)
    try {
      const photoUrls = await uploadFiles()
      if (!photoUrls) return

      if (splitPerPhoto) {
        // One inbox row PER photo — each is a separate receipt
        let successCount = 0
        let lastError: string | null = null
        for (const url of photoUrls) {
          const res = await onInsert(buildInsert([url]))
          if (res.error) {
            lastError = res.error
          } else {
            successCount++
          }
        }

        if (successCount === 0 && lastError) {
          setStep('error')
          setToast({ type: 'err', msg: lastError })
          return
        }

        setStep('done')
        setToast({ type: 'ok', msg: `Uploaded ${successCount} receipt(s) — parse from the list` })
      } else {
        // All photos → one inbox row (single receipt, multiple pages)
        const res = await onInsert(buildInsert(photoUrls))
        if (res.error) {
          setStep('error')
          setToast({ type: 'err', msg: res.error })
          return
        }

        setStep('done')
        setToast({ type: 'ok', msg: `Uploaded 1 receipt (${photoUrls.length} photos) — parse from the list` })
      }

      setProgress('')
      for (const f of files) if (f.previewUrl) URL.revokeObjectURL(f.previewUrl)
      setFiles([])
      setNoteText('')
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

      if (!oneReceipt && photoUrls.length > 1) {
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
        // Single receipt mode — insert + auto-parse
        setStep('analyzing')
        setProgress('Uploading receipt...')

        const res = await onInsert(buildInsert(photoUrls))
        if (res.error || !res.id) {
          setStep('error')
          setToast({ type: 'err', msg: res.error || 'Insert failed — no ID returned' })
          return
        }

        // Auto-trigger parsing if onParse is available
        if (onParse) {
          setProgress('Parsing receipt with AI...')
          const parseRes = await onParse(res.id, model)
          if (!parseRes.ok) {
            setStep('error')
            setToast({ type: 'err', msg: parseRes.error || 'Parse failed' })
            return
          }
          setStep('done')
          setToast({ type: 'ok', msg: 'Uploaded & parsing started! Check the list below.' })
        } else {
          setStep('done')
          setToast({ type: 'ok', msg: 'Uploaded! Parse from the list.' })
        }
      }

      setProgress('')
      for (const f of files) if (f.previewUrl) URL.revokeObjectURL(f.previewUrl)
      setFiles([])
      setNoteText('')
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

        {/* ── Note / voice input ── */}
        <div className="flex items-center gap-2">
          <input
            ref={noteInputRef}
            type="text"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (files.length > 0) handleProcess()
                else if (noteText.trim()) handleNoteOnly()
              }
            }}
            placeholder={files.length > 0 ? 'Add note: supplier, amount, date...' : 'макро 3500 · water 200 вчера · or drop photos above'}
            className="flex-1 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-indigo-500 transition-colors"
            disabled={isProcessing}
          />
          {hasSpeech && (
            <button
              type="button"
              onClick={toggleMic}
              disabled={isProcessing}
              className={`rounded-md p-2 transition-colors ${
                isListening
                  ? 'bg-rose-500/20 text-rose-400 animate-pulse'
                  : 'bg-slate-800 text-slate-500 hover:bg-slate-700 hover:text-slate-300'
              } disabled:opacity-40`}
              title={isListening ? 'Stop' : 'Voice input'}
            >
              {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
          )}
          {/* Note-only send (no photos) */}
          {files.length === 0 && noteText.trim() && (
            <button
              type="button"
              onClick={handleNoteOnly}
              disabled={isProcessing}
              className="rounded-md bg-indigo-600 p-2 text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
              title="Send note only (no photos)"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* ── Controls ── */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* One receipt toggle */}
          <label className="flex cursor-pointer items-center gap-1.5 select-none">
            <input
              type="checkbox"
              checked={oneReceipt}
              onChange={(e) => setOneReceipt(e.target.checked)}
              disabled={isProcessing}
              className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-0 focus:ring-offset-0 disabled:opacity-40"
            />
            <span className="text-[11px] text-slate-400">One receipt (multi-page)</span>
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

          {/* Upload only — uses oneReceipt toggle for split logic */}
          <button
            type="button"
            onClick={() => handleUploadOnly(!oneReceipt)}
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
