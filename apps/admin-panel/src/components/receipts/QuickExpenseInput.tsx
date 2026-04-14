import { useCallback, useRef, useState } from 'react'
import { Mic, MicOff, Send, Loader2 } from 'lucide-react'
import { parseQuickExpense } from '../../utils/parseQuickExpense'
import type { InboxInsert } from '../../hooks/useReceiptInbox'

interface Props {
  onInsert: (payload: InboxInsert) => Promise<{ id?: string; error?: string }>
}

// SpeechRecognition type shim for browsers
interface SpeechRecognitionInstance {
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

export function QuickExpenseInput({ onInsert }: Props) {
  const [text, setText] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const hasSpeech = typeof window !== 'undefined' && !!(window.SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition)

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
    recognition.lang = 'ru-RU' // Primary: Russian. Also picks up English/Thai words.

    recognition.onresult = (event: { results: SpeechRecognitionResultList }) => {
      const transcript = event.results[0]?.[0]?.transcript ?? ''
      setText((prev) => (prev ? prev + ' ' + transcript : transcript).trim())
      setIsListening(false)
    }
    recognition.onerror = (event: { error: string }) => {
      console.warn('[QuickExpense] Speech error:', event.error)
      setIsListening(false)
    }
    recognition.onend = () => setIsListening(false)

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }, [isListening])

  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim()
    if (!trimmed) return

    setIsSending(true)
    setFeedback(null)

    const parsed = parseQuickExpense(trimmed)

    const payload: InboxInsert = {
      uploaded_by: 'lesia',
      photo_urls: [],
      supplier_hint: parsed.supplier_hint,
      amount_hint: parsed.amount_hint,
      receipt_date: parsed.receipt_date,
      notes: `[quick-entry] ${parsed.raw_text}`,
    }

    const res = await onInsert(payload)
    setIsSending(false)

    if (res.error) {
      setFeedback({ type: 'err', msg: res.error })
    } else {
      const parts = []
      if (parsed.supplier_hint) parts.push(parsed.supplier_hint)
      if (parsed.amount_hint) parts.push(`฿${parsed.amount_hint.toLocaleString()}`)
      parts.push(parsed.receipt_date)
      setFeedback({ type: 'ok', msg: `Added: ${parts.join(' · ')}` })
      setText('')
      inputRef.current?.focus()
    }
  }, [text, onInsert])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
      <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
        Quick expense — type or speak
      </div>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => { setText(e.target.value); setFeedback(null) }}
          onKeyDown={handleKeyDown}
          placeholder="макро 3500 · water 200 вчера · ice 150..."
          className="flex-1 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-indigo-500 transition-colors"
          disabled={isSending}
        />
        {hasSpeech && (
          <button
            type="button"
            onClick={toggleMic}
            className={`rounded-md p-2 transition-colors ${
              isListening
                ? 'bg-rose-500/20 text-rose-400 animate-pulse'
                : 'bg-slate-800 text-slate-500 hover:bg-slate-700 hover:text-slate-300'
            }`}
            title={isListening ? 'Stop listening' : 'Start voice input'}
          >
            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!text.trim() || isSending}
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
      {feedback && (
        <div className={`mt-2 text-xs ${feedback.type === 'ok' ? 'text-emerald-400' : 'text-rose-400'}`}>
          {feedback.msg}
        </div>
      )}
    </div>
  )
}
