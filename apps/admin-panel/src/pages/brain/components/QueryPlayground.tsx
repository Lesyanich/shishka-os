import { useState, useCallback, type KeyboardEvent } from 'react'
import { Loader2, Send, AlertTriangle, ThumbsUp, ThumbsDown, Check } from 'lucide-react'
import { queryBrain, LightragError, type QueryMode } from '../../../api/lightrag'
import { rateQuery } from '../../../api/brainQuality'

const MODES: QueryMode[] = ['naive', 'local', 'global', 'hybrid', 'mix']

const MODE_HINTS: Record<QueryMode, string> = {
  naive: 'Chunk search only',
  local: 'Entity-focused',
  global: 'Relationship-focused',
  hybrid: 'Entity + relationships',
  mix: 'All sources (recommended)',
}

interface QueryResult {
  response: string
  mode: QueryMode
  latencyMs: number
}

export function QueryPlayground() {
  const [question, setQuestion] = useState('')
  const [mode, setMode] = useState<QueryMode>('mix')
  const [result, setResult] = useState<QueryResult | null>(null)
  const [isQuerying, setIsQuerying] = useState(false)
  const [error, setError] = useState<{ message: string; details?: string } | null>(null)
  const [ratingStatus, setRatingStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  const submit = useCallback(async () => {
    const q = question.trim()
    if (!q || isQuerying) return

    setIsQuerying(true)
    setError(null)
    setResult(null)
    setRatingStatus('idle')

    const t0 = performance.now()
    try {
      const res = await queryBrain(q, mode)
      const latencyMs = Math.round(performance.now() - t0)
      setResult({ response: res.response, mode, latencyMs })
    } catch (err) {
      if (err instanceof LightragError) {
        setError({ message: err.message, details: err.body })
      } else {
        setError({ message: err instanceof Error ? err.message : 'Unknown error' })
      }
    } finally {
      setIsQuerying(false)
    }
  }, [question, mode, isQuerying])

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      void submit()
    }
  }

  return (
    <div className="flex flex-col gap-3 border-b border-slate-800 bg-slate-900/30 px-3 py-3">
      {/* Input row */}
      <div className="flex gap-2">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask the brain… (Ctrl+Enter to submit)"
          rows={2}
          className="flex-1 resize-none rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-fuchsia-500/60 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!question.trim() || isQuerying}
          className="flex h-auto items-center gap-1.5 self-end rounded-md border border-fuchsia-500/40 bg-fuchsia-500/10 px-3 py-2 text-xs font-medium text-fuchsia-200 transition hover:bg-fuchsia-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isQuerying ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          Ask
        </button>
      </div>

      {/* Mode selector */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-slate-500 mr-1">Mode</span>
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            title={MODE_HINTS[m]}
            className={[
              'rounded border px-2 py-0.5 text-[11px] transition',
              mode === m
                ? 'border-fuchsia-400 bg-fuchsia-500/10 text-fuchsia-200'
                : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200',
            ].join(' ')}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
            <div className="min-w-0 text-xs text-red-300">
              <p>{error.message}</p>
              {error.details && (
                <details className="mt-1 text-[11px] text-red-400/70">
                  <summary className="cursor-pointer">Raw response</summary>
                  <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap rounded bg-slate-950 p-2 font-mono">
                    {error.details}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {isQuerying && (
        <div className="flex items-center gap-2 py-4 text-xs text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Thinking…
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="rounded-lg border border-slate-800 bg-slate-950/80">
          <pre className="max-h-[30vh] overflow-y-auto whitespace-pre-wrap px-3 py-3 font-sans text-xs leading-relaxed text-slate-300">
            {result.response}
          </pre>
          <div className="flex items-center gap-3 border-t border-slate-800 px-3 py-1.5 text-[10px] text-slate-500">
            <span>{result.latencyMs}ms</span>
            <span>mode: {result.mode}</span>
            <span>{result.response.length} chars</span>
            <span className="ml-auto flex items-center gap-1">
              {ratingStatus === 'saved' ? (
                <span className="flex items-center gap-1 text-emerald-400">
                  <Check className="h-3 w-3" /> Rated
                </span>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={ratingStatus === 'saving'}
                    onClick={async () => {
                      setRatingStatus('saving')
                      await rateQuery(question, 5)
                      setRatingStatus('saved')
                    }}
                    className="rounded p-1 text-slate-500 transition hover:bg-emerald-500/10 hover:text-emerald-400 disabled:opacity-40"
                    title="Good answer"
                  >
                    <ThumbsUp className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    disabled={ratingStatus === 'saving'}
                    onClick={async () => {
                      setRatingStatus('saving')
                      await rateQuery(question, 1)
                      setRatingStatus('saved')
                    }}
                    className="rounded p-1 text-slate-500 transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                    title="Poor answer"
                  >
                    <ThumbsDown className="h-3 w-3" />
                  </button>
                </>
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
