import { useEffect, useRef, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { ChefHat, Loader2, Send, X, RotateCcw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { ChefModelSelector } from './ChefModelSelector'
import {
  loadSelectedModel,
  saveSelectedModel,
  type ModelOption,
} from './modelCatalog'

interface ChefChatPanelProps {
  open: boolean
  onClose: () => void
  /** Optional page context (e.g. dish_id when opened from a dish row) */
  context?: Record<string, unknown>
}

export function ChefChatPanel({ open, onClose, context }: ChefChatPanelProps) {
  // ─── Auth token ref (kept fresh via Supabase session listener) ───
  const jwtRef = useRef<string | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [hasSession, setHasSession] = useState(false) // observable version of jwtRef for UI

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      const tok = data.session?.access_token ?? null
      jwtRef.current = tok
      setHasSession(tok !== null)
      setAuthReady(true)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const tok = session?.access_token ?? null
      jwtRef.current = tok
      setHasSession(tok !== null)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  // ─── Model selection ─────────────────────────────────────────
  const [model, setModel] = useState<ModelOption>(() => loadSelectedModel())

  const modelRef = useRef(model)
  useEffect(() => {
    modelRef.current = model
    saveSelectedModel(model)
  }, [model])

  const contextRef = useRef(context)
  useEffect(() => {
    contextRef.current = context
  }, [context])

  // ─── useChat ─────────────────────────────────────────────────
  // The body/headers callbacks read ref.current at REQUEST time (not render
  // time) — AI SDK's recommended pattern for dynamic auth tokens:
  // https://ai-sdk.dev/docs/troubleshooting/use-chat-custom-request-options
  // The react-hooks/refs rule can't see through the deferred callbacks and
  // flags them as false positives — disabled locally with justification.
  /* eslint-disable react-hooks/refs */
  const { messages, sendMessage, status, error, regenerate, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chef/chat',
      headers: (): Record<string, string> => {
        const jwt = jwtRef.current
        return jwt ? { Authorization: `Bearer ${jwt}` } : {}
      },
      body: () => ({
        provider: modelRef.current.provider,
        model: modelRef.current.id,
        context: contextRef.current,
      }),
    }),
  })
  /* eslint-enable react-hooks/refs */

  // ─── Input state ─────────────────────────────────────────────
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Auto-scroll to bottom on new messages
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, status])

  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 100)
    }
  }, [open])

  const isBusy = status === 'submitted' || status === 'streaming'

  const handleSend = () => {
    const text = input.trim()
    if (!text || isBusy || !jwtRef.current) return
    sendMessage({ text })
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleReset = () => {
    setMessages([])
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm"
      />

      {/* Panel */}
      <aside
        onTouchStart={(e) => e.stopPropagation()}
        className="fixed right-0 top-0 z-50 flex h-dvh w-full max-w-lg flex-col border-l border-slate-800 bg-slate-950 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15">
              <ChefHat className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100">AI Chef</h2>
              <p className="text-[10px] text-slate-500">Menu composition assistant</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ChefModelSelector value={model} onChange={setModel} disabled={isBusy} />
            {messages.length > 0 && (
              <button
                onClick={handleReset}
                disabled={isBusy}
                className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-slate-200 disabled:opacity-50"
                title="New conversation"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-slate-200"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {!authReady ? (
            <div className="flex items-center justify-center py-12 text-xs text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Authenticating...
            </div>
          ) : !hasSession ? (
            <div className="rounded-lg border border-amber-800/50 bg-amber-950/30 px-4 py-6 text-center">
              <p className="text-sm font-medium text-amber-200">Please log in to use AI Chef</p>
              <p className="mt-1 text-[11px] text-amber-400/80">
                No Supabase session detected. Sign in (top-right) then reopen this panel.
              </p>
            </div>
          ) : messages.length === 0 ? (
            <EmptyState model={model} />
          ) : (
            messages.map((m) => <MessageBubble key={m.id} message={m} />)
          )}

          {isBusy && messages[messages.length - 1]?.role === 'user' && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              {model.label} is thinking...
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-rose-800/50 bg-rose-950/30 p-3 text-xs text-rose-300">
              <div className="font-medium mb-1">Error</div>
              <div className="text-rose-400">{error.message}</div>
              <button
                onClick={() => regenerate()}
                className="mt-2 rounded-md border border-rose-700 px-2 py-1 text-[11px] text-rose-200 transition hover:bg-rose-900/30"
              >
                Retry
              </button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-slate-800 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                !authReady
                  ? 'Authenticating...'
                  : !hasSession
                    ? 'Log in first to use AI Chef'
                    : 'Ask the chef...'
              }
              disabled={!authReady || !hasSession || isBusy}
              rows={2}
              className="flex-1 resize-none rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:border-emerald-500 focus:outline-none disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isBusy || !authReady || !hasSession}
              className="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-600 text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              title={!hasSession ? 'Please log in first' : 'Send (Enter)'}
            >
              {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </button>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-600">
            <span>Enter to send · Shift+Enter for newline</span>
            <span>Chef can't write to DB yet — ask or confirm before changes land</span>
          </div>
        </div>
      </aside>
    </>
  )
}

// ─── Message bubble ──────────────────────────────────────────

interface UIMessageLike {
  id: string
  role: 'user' | 'assistant' | 'system'
  parts?: Array<{ type: string; text?: string; toolName?: string; result?: unknown; state?: string }>
  content?: string
}

function MessageBubble({ message }: { message: UIMessageLike }) {
  const isUser = message.role === 'user'
  const parts = message.parts ?? []
  const hasToolParts = parts.some((p) => p.type === 'tool-invocation')

  // For user messages or simple text-only assistant messages, render text bubble
  if (isUser || !hasToolParts) {
    const text = extractText(message)
    return (
      <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
        <div
          className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${
            isUser
              ? 'bg-emerald-600/20 text-slate-100 border border-emerald-700/30'
              : 'bg-slate-800/60 text-slate-100 border border-slate-700/50'
          }`}
        >
          <div className="whitespace-pre-wrap leading-relaxed">{text}</div>
        </div>
      </div>
    )
  }

  // Assistant message with tool calls — render each part
  return (
    <div className="space-y-2">
      {parts.map((part, i) => {
        if (part.type === 'text' && part.text) {
          return (
            <div key={i} className="flex justify-start">
              <div className="max-w-[85%] rounded-lg border border-slate-700/50 bg-slate-800/60 px-3 py-2 text-xs text-slate-100">
                <div className="whitespace-pre-wrap leading-relaxed">{part.text}</div>
              </div>
            </div>
          )
        }

        if (part.type === 'tool-invocation') {
          const toolName = part.toolName ?? 'tool'
          const state = part.state ?? 'result'
          const isRunning = state === 'call' || state === 'partial-call'

          return (
            <div key={i} className="flex justify-start">
              <div className="max-w-[85%] rounded-lg border border-sky-800/30 bg-sky-950/30 px-3 py-1.5 text-[11px]">
                <div className="flex items-center gap-1.5 text-sky-300">
                  {isRunning ? (
                    <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-sky-400" />
                  ) : (
                    <span className="text-[10px]">✓</span>
                  )}
                  <span className="font-mono font-medium">{toolName}</span>
                  <span className="text-sky-500">
                    {isRunning ? 'querying...' : 'done'}
                  </span>
                </div>
              </div>
            </div>
          )
        }

        return null
      })}
    </div>
  )
}

function extractText(m: UIMessageLike): string {
  if (typeof m.content === 'string') return m.content
  if (Array.isArray(m.parts)) {
    return m.parts
      .filter((p) => p.type === 'text' && typeof p.text === 'string')
      .map((p) => p.text)
      .join('')
  }
  return ''
}

// ─── Empty state ─────────────────────────────────────────────

function EmptyState({ model }: { model: ModelOption }) {
  const suggestions = [
    'Какие блюда у нас сейчас в меню?',
    'У каких блюд нет состава (BOM)?',
    'Какая маржа у наших блюд?',
    'Что входит в состав борща?',
  ]

  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <ChefHat className="h-10 w-10 text-slate-600 mb-3" />
      <p className="text-sm font-medium text-slate-300">Chef is ready</p>
      <p className="mt-1 text-[11px] text-slate-500">
        Using {model.label}. I can read your menu, BOM, and cost data.
      </p>
      <div className="mt-5 w-full space-y-1.5 px-2">
        <div className="text-[9px] font-bold uppercase tracking-wider text-slate-600 text-left">
          Try asking
        </div>
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => {
              const ta = document.querySelector<HTMLTextAreaElement>('aside textarea')
              if (ta) {
                ta.value = s
                ta.focus()
                // dispatch input event so React state updates
                ta.dispatchEvent(new Event('input', { bubbles: true }))
              }
            }}
            className="block w-full rounded-md border border-slate-800 bg-slate-900/40 px-3 py-2 text-left text-[11px] text-slate-400 transition hover:border-slate-700 hover:bg-slate-800/50 hover:text-slate-200"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}
