import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { Bell, Check, X, AlertTriangle } from 'lucide-react'

/**
 * Minimal zero-dependency toast system (dark theme, matches admin panel).
 *
 * Why hand-rolled: the project convention is "new npm deps only after
 * discussion", and the only existing toasts are ad-hoc local state. This gives
 * a shared, reusable surface (new-order alerts, print success/failure) without
 * pulling in `sonner` or similar.
 *
 * Usage:
 *   <ToastProvider>...</ToastProvider>   // wrap the subtree
 *   const toast = useToast()
 *   toast.push({ title: 'New order #042', variant: 'info', durationMs: null })
 */

export type ToastVariant = 'info' | 'success' | 'error'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastInput {
  title: string
  body?: string
  variant?: ToastVariant
  /** ms before auto-dismiss; `null` = persistent until dismissed. Default 6000. */
  durationMs?: number | null
  action?: ToastAction
}

interface ToastItem extends ToastInput {
  id: number
}

interface ToastApi {
  push: (t: ToastInput) => number
  dismiss: (id: number) => void
}

const ToastCtx = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
  return ctx
}

let nextId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (t: ToastInput) => {
      const id = ++nextId
      setToasts((prev) => [...prev, { ...t, id }])
      const duration = t.durationMs === undefined ? 6000 : t.durationMs
      if (duration != null) {
        window.setTimeout(() => dismiss(id), duration)
      }
      return id
    },
    [dismiss],
  )

  return (
    <ToastCtx.Provider value={{ push, dismiss }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastCtx.Provider>
  )
}

const VARIANT_STYLE: Record<ToastVariant, { border: string; icon: ReactNode }> = {
  info: {
    border: 'border-sky-500/50',
    icon: <Bell className="h-4 w-4 text-sky-300" />,
  },
  success: {
    border: 'border-emerald-500/50',
    icon: <Check className="h-4 w-4 text-emerald-300" />,
  },
  error: {
    border: 'border-rose-500/50',
    icon: <AlertTriangle className="h-4 w-4 text-rose-300" />,
  },
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[]
  onDismiss: (id: number) => void
}) {
  if (toasts.length === 0) return null
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  )
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    const r = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(r)
  }, [])

  const style = VARIANT_STYLE[toast.variant ?? 'info']
  return (
    <div
      className={[
        'pointer-events-auto rounded-lg border bg-slate-900/95 p-3 shadow-2xl backdrop-blur transition-all duration-200',
        style.border,
        entered ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0',
      ].join(' ')}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 shrink-0">{style.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-100">{toast.title}</p>
          {toast.body && (
            <p className="mt-0.5 text-[11px] text-slate-400">{toast.body}</p>
          )}
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action?.onClick()
                onDismiss()
              }}
              className="mt-2 inline-flex h-6 items-center rounded border border-slate-600 px-2 text-[11px] font-medium text-slate-200 hover:bg-slate-800"
            >
              {toast.action.label}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded p-0.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
