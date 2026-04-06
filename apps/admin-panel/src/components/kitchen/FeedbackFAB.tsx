import { useState, useCallback, useRef, useEffect } from 'react'
import { MessageCircle, Mic, MicOff, Send, X, Type } from 'lucide-react'
import { supabase } from '../../lib/supabase'

// ─── Types ──────────────────────────────────────────────────────

type FeedbackType = 'suggestion' | 'problem' | 'question' | 'other'

interface FeedbackFABProps {
  staffId: string | null
  activeTaskId?: string | null
}

const FEEDBACK_TYPES: { value: FeedbackType; label: string; color: string }[] = [
  { value: 'problem', label: 'Problem', color: 'bg-rose-500/20 text-rose-300 border-rose-500/40' },
  { value: 'suggestion', label: 'Suggestion', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
  { value: 'question', label: 'Question', color: 'bg-sky-500/20 text-sky-300 border-sky-500/40' },
  { value: 'other', label: 'Other', color: 'bg-slate-500/20 text-slate-300 border-slate-500/40' },
]

const VOICE_LANGUAGES = [
  { code: 'th-TH', label: 'TH' },
  { code: 'en-US', label: 'EN' },
  { code: 'ru-RU', label: 'RU' },
  { code: 'ar-SA', label: 'AR' },
]

// ─── Component ──────────────────────────────────────────────────

export function FeedbackFAB({ staffId, activeTaskId }: FeedbackFABProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [mode, setMode] = useState<'voice' | 'text'>('voice')
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('other')
  const [text, setText] = useState('')
  const [voiceLang, setVoiceLang] = useState('th-TH')
  const [isListening, setIsListening] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recognitionRef = useRef<SpeechRecognition | null>(null)

  // Clean up speech recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort()
      }
    }
  }, [])

  const startVoice = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setError('Voice not supported in this browser')
      setMode('text')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = voiceLang
    recognition.continuous = false
    recognition.interimResults = false

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0]?.[0]?.transcript ?? ''
      setText(prev => prev ? prev + ' ' + transcript : transcript)
      setIsListening(false)
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.warn('[FeedbackFAB] speech error:', event.error)
      setIsListening(false)
      if (event.error === 'not-allowed') {
        setError('Microphone access denied')
      }
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
    setError(null)
  }, [voiceLang])

  const stopVoice = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
    setIsListening(false)
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!text.trim()) return
    setIsSaving(true)
    setError(null)

    const { error: insertErr } = await supabase.from('cook_feedback').insert({
      staff_id: staffId,
      production_task_id: activeTaskId ?? null,
      type: feedbackType,
      raw_text: text.trim(),
      language_detected: voiceLang.split('-')[0],
    })

    if (insertErr) {
      setError(insertErr.message)
      setIsSaving(false)
      return
    }

    setSaved(true)
    setIsSaving(false)
    setTimeout(() => {
      setIsOpen(false)
      setSaved(false)
      setText('')
      setFeedbackType('other')
    }, 1500)
  }, [text, feedbackType, staffId, activeTaskId, voiceLang])

  const handleClose = useCallback(() => {
    if (isListening) stopVoice()
    setIsOpen(false)
    setText('')
    setError(null)
    setSaved(false)
  }, [isListening, stopVoice])

  // ─── FAB button (closed state) ────────────────────────────────
  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-sky-600 text-white shadow-lg shadow-sky-600/30 transition hover:bg-sky-500 active:scale-95"
      >
        <MessageCircle className="h-6 w-6" />
      </button>
    )
  }

  // ─── Feedback panel (open state) ──────────────────────────────
  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <span className="text-sm font-semibold text-slate-100">Feedback</span>
        <button type="button" onClick={handleClose} className="text-slate-500 hover:text-slate-300">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-4 space-y-3">
        {/* Success state */}
        {saved && (
          <div className="py-6 text-center">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10">
              <Send className="h-5 w-5 text-emerald-400" />
            </div>
            <p className="text-sm font-medium text-emerald-300">Feedback saved!</p>
          </div>
        )}

        {!saved && (
          <>
            {/* Type selector */}
            <div className="flex flex-wrap gap-1.5">
              {FEEDBACK_TYPES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setFeedbackType(t.value)}
                  className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
                    feedbackType === t.value ? t.color : 'border-slate-700 bg-slate-800 text-slate-500'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Mode toggle */}
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setMode('voice')}
                className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition ${
                  mode === 'voice' ? 'bg-sky-500/20 text-sky-300' : 'bg-slate-800 text-slate-500'
                }`}
              >
                <Mic className="mr-1 inline h-3 w-3" /> Voice
              </button>
              <button
                type="button"
                onClick={() => setMode('text')}
                className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition ${
                  mode === 'text' ? 'bg-sky-500/20 text-sky-300' : 'bg-slate-800 text-slate-500'
                }`}
              >
                <Type className="mr-1 inline h-3 w-3" /> Text
              </button>
            </div>

            {/* Voice mode */}
            {mode === 'voice' && (
              <div className="space-y-2">
                {/* Language selector */}
                <div className="flex gap-1">
                  {VOICE_LANGUAGES.map(l => (
                    <button
                      key={l.code}
                      type="button"
                      onClick={() => setVoiceLang(l.code)}
                      className={`flex-1 rounded py-1 text-[10px] font-medium transition ${
                        voiceLang === l.code ? 'bg-slate-700 text-slate-200' : 'bg-slate-800/50 text-slate-500'
                      }`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>

                {/* Record button */}
                <button
                  type="button"
                  onClick={isListening ? stopVoice : startVoice}
                  className={`flex w-full items-center justify-center gap-2 rounded-xl py-4 text-sm font-medium transition ${
                    isListening
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
                      : 'bg-sky-500/10 text-sky-300 border border-sky-500/30 hover:bg-sky-500/20'
                  }`}
                >
                  {isListening ? (
                    <><MicOff className="h-5 w-5" /> Listening... tap to stop</>
                  ) : (
                    <><Mic className="h-5 w-5" /> Tap to speak</>
                  )}
                </button>
              </div>
            )}

            {/* Text area (always visible if there's text, or in text mode) */}
            {(mode === 'text' || text) && (
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Type your feedback..."
                rows={3}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-sky-500 resize-none"
              />
            )}

            {/* Context indicator */}
            {activeTaskId && (
              <p className="text-[10px] text-slate-500">
                Linked to current task
              </p>
            )}

            {error && <p className="text-xs text-rose-400">{error}</p>}

            {/* Submit */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!text.trim() || isSaving}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
              {isSaving ? 'Saving...' : 'Send Feedback'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
