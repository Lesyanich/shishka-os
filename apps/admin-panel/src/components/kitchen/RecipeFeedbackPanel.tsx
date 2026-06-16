import { useRef, useState } from 'react'
import { MessageCircle, X, Send, Trash2, Loader2 } from 'lucide-react'
import { useRecipeFeedback } from '../../hooks/useRecipeFeedback'
import { useAppRole } from '../../contexts/AppRoleContext'

interface RecipeFeedbackPanelProps {
  dishId: string
  dishName: string
  onClose: () => void
  /** Called after a comment is added so the parent can refresh counts. */
  onCountChange?: () => void
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h ago`
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function RecipeFeedbackPanel({
  dishId,
  dishName,
  onClose,
  onCountChange,
}: RecipeFeedbackPanelProps) {
  const { staffId, staffName, role } = useAppRole()
  const { feedback, isLoading, addFeedback, deleteFeedback } =
    useRecipeFeedback(dishId)
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)

  async function handleSubmit() {
    const trimmed = body.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    setError(null)
    const { ok, error: err } = await addFeedback(
      trimmed,
      staffId,
      staffName ?? 'Staff',
    )
    setSubmitting(false)
    if (!ok) {
      setError(err ?? 'Failed to save comment')
    } else {
      setBody('')
      onCountChange?.()
      textRef.current?.focus()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.key === 'Enter' && (e.ctrlKey || e.metaKey)) && !submitting) {
      e.preventDefault()
      void handleSubmit()
    }
  }

  const canDelete = (entryStaffId: string | null) =>
    role === 'owner' || role === 'task_manager' || entryStaffId === staffId

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-surface-3 bg-surface-1 shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-surface-3 px-4 py-3">
          <MessageCircle className="h-4 w-4 shrink-0 text-forest-soft" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium uppercase tracking-wider text-cream/50">
              Recipe feedback
            </p>
            <p className="truncate text-sm font-semibold text-cream">{dishName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-cream/50 transition hover:bg-surface-3 hover:text-cream"
            aria-label="Close feedback panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Comments list */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-cream/40">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : feedback.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-cream/40">
              <MessageCircle className="h-8 w-8" />
              <p className="text-sm">No comments yet.</p>
              <p className="text-xs">Be the first to leave feedback!</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {feedback.map((entry) => (
                <li
                  key={entry.id}
                  className="group rounded-xl border border-surface-3 bg-surface-2 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-cream/80">
                          {entry.staff_name || 'Staff'}
                        </span>
                        <span className="text-[10px] text-cream/40">
                          {formatDate(entry.created_at)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-cream/75">
                        {entry.body}
                      </p>
                    </div>
                    {canDelete(entry.staff_id) && (
                      <button
                        type="button"
                        onClick={() => void deleteFeedback(entry.id)}
                        className="shrink-0 rounded-md p-1 text-cream/30 opacity-0 transition hover:bg-brick-soft/20 hover:text-brick-soft group-hover:opacity-100"
                        aria-label="Delete comment"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-surface-3 px-4 py-3">
          {error && (
            <p className="mb-2 rounded-md bg-brick-soft/15 px-3 py-1.5 text-xs text-brick-soft">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <textarea
              ref={textRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Leave a comment... (Ctrl+Enter to send)"
              rows={3}
              maxLength={2000}
              className="min-h-0 w-full resize-none rounded-xl border border-surface-3 bg-surface-2 px-3 py-2 text-sm text-cream placeholder:text-cream/30 focus:border-forest-soft/60 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!body.trim() || submitting}
              className="flex shrink-0 items-center justify-center rounded-xl bg-forest-soft px-3 py-2 text-surface-1 transition hover:bg-forest-soft/90 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Submit comment"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
          <p className="mt-1 text-right text-[10px] text-cream/30">
            {body.length}/2000
          </p>
        </div>
      </div>
    </>
  )
}
