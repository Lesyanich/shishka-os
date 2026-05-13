import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { ChefHat, ArrowLeft, Delete } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

interface CookOption {
  id: string
  name: string
  email: string | null
  pin_set_at: string | null
}

const PIN_LENGTH = 6
const COOK_ID_KEY = 'shishka.kitchen_login.cook_id'
const RATE_LIMIT_KEY = 'shishka.kitchen_login.failed_until'
const MAX_FAILED = 5
const LOCKOUT_MS = 30_000

function cookEmail(name: string): string {
  // Mirror the normalization used in services/supabase/functions/_shared/auth.ts
  const handle = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `cook-${handle}@kitchen.shishka.local`
}

function readLockoutMs(): number {
  const raw = localStorage.getItem(RATE_LIMIT_KEY)
  if (!raw) return 0
  const until = Number(raw)
  if (!Number.isFinite(until)) return 0
  return Math.max(0, until - Date.now())
}

export function KitchenLogin() {
  const { user, loading: authLoading } = useAuth()
  const [cooks, setCooks] = useState<CookOption[]>([])
  const [cooksLoading, setCooksLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(
    () => localStorage.getItem(COOK_ID_KEY),
  )
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [failedCount, setFailedCount] = useState(0)
  const [lockoutMs, setLockoutMs] = useState<number>(() => readLockoutMs())

  // Tick the lockout timer down to zero
  useEffect(() => {
    if (lockoutMs <= 0) return
    const t = setInterval(() => {
      const remaining = readLockoutMs()
      setLockoutMs(remaining)
      if (remaining <= 0) clearInterval(t)
    }, 250)
    return () => clearInterval(t)
  }, [lockoutMs])

  useEffect(() => {
    let cancelled = false
    supabase
      .from('staff')
      .select('id, name, email, pin_set_at')
      .eq('app_role', 'cook')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        if (cancelled) return
        setCooks(data ?? [])
        setCooksLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const selected = useMemo(
    () => cooks.find((c) => c.id === selectedId) ?? null,
    [cooks, selectedId],
  )

  // Auto-submit when the PIN reaches full length. Declared before any early
  // return so the hook order stays stable across renders (rules-of-hooks).
  useEffect(() => {
    if (pin.length !== PIN_LENGTH) return
    if (!selected || submitting || lockoutMs > 0) return

    let cancelled = false
    const run = async () => {
      setSubmitting(true)
      setError(null)
      const email = selected.email || cookEmail(selected.name)
      const { error: err } = await supabase.auth.signInWithPassword({
        email,
        password: pin,
      })
      if (cancelled) return
      if (err) {
        const next = failedCount + 1
        setFailedCount(next)
        setPin('')
        if (next >= MAX_FAILED) {
          const until = Date.now() + LOCKOUT_MS
          localStorage.setItem(RATE_LIMIT_KEY, String(until))
          setLockoutMs(LOCKOUT_MS)
          setFailedCount(0)
        }
        setError('Неверный PIN')
        setSubmitting(false)
        return
      }
      localStorage.removeItem(RATE_LIMIT_KEY)
      // Navigation handled by the <Navigate> branch below once auth state propagates.
    }
    run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin])

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
      </div>
    )
  }

  if (user) return <Navigate to="/" replace />

  function appendDigit(d: string) {
    if (lockoutMs > 0 || submitting) return
    setError(null)
    setPin((p) => (p.length >= PIN_LENGTH ? p : p + d))
  }

  function backspace() {
    setError(null)
    setPin((p) => p.slice(0, -1))
  }

  function clearPin() {
    setError(null)
    setPin('')
  }

  function pickCook(id: string) {
    setSelectedId(id)
    localStorage.setItem(COOK_ID_KEY, id)
    setPin('')
    setError(null)
  }

  function changeCook() {
    setSelectedId(null)
    localStorage.removeItem(COOK_ID_KEY)
    setPin('')
    setError(null)
  }

  // Auto-submit happens in the useEffect declared above on full PIN length.

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-8">
      <div className="w-full max-w-lg space-y-8">
        <header className="flex flex-col items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/15 text-sky-300">
            <ChefHat className="h-6 w-6" />
          </span>
          <h1 className="text-xl font-semibold text-slate-100">Kitchen</h1>
          <p className="text-sm text-slate-500">
            {selected ? `Вход для ${selected.name}` : 'Выберите своё имя'}
          </p>
        </header>

        {/* Stage 1: name picker */}
        {!selected && (
          <div>
            {cooksLoading ? (
              <div className="flex items-center justify-center py-10 text-slate-500">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
              </div>
            ) : cooks.length === 0 ? (
              <p className="rounded-lg bg-slate-900/60 px-4 py-6 text-center text-sm text-slate-400 ring-1 ring-slate-800">
                Нет активных поваров. Попросите владельца настроить PIN в /hr/staff.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {cooks.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => pickCook(c.id)}
                    className="flex flex-col items-center gap-2 rounded-xl bg-slate-900/70 px-3 py-5 ring-1 ring-slate-800 transition hover:bg-slate-800/80 hover:ring-sky-500/50 active:scale-95"
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-500/15 text-sky-300">
                      <ChefHat className="h-6 w-6" />
                    </span>
                    <span className="text-sm font-medium text-slate-100">{c.name}</span>
                    {!c.pin_set_at && (
                      <span className="text-[10px] text-amber-400">PIN не задан</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Stage 2: PIN keypad */}
        {selected && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <button
                onClick={changeCook}
                className="flex items-center gap-1 text-xs text-slate-400 transition hover:text-slate-200"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Сменить
              </button>
              <span className="text-xs text-slate-500">PIN · {PIN_LENGTH} цифр</span>
            </div>

            {/* Dots */}
            <div className="flex justify-center gap-3">
              {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                <span
                  key={i}
                  className={[
                    'h-3 w-3 rounded-full transition',
                    i < pin.length ? 'bg-sky-400' : 'bg-slate-800',
                  ].join(' ')}
                />
              ))}
            </div>

            {error && <p className="text-center text-sm text-red-400">{error}</p>}
            {lockoutMs > 0 && (
              <p className="text-center text-xs text-amber-400">
                Слишком много попыток. Подождите {Math.ceil(lockoutMs / 1000)}с.
              </p>
            )}

            {/* Keypad */}
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
                <button
                  key={d}
                  onClick={() => appendDigit(String(d))}
                  disabled={submitting || lockoutMs > 0}
                  className="rounded-xl bg-slate-900/70 py-5 text-2xl font-semibold text-slate-100 ring-1 ring-slate-800 transition hover:bg-slate-800/80 active:scale-95 disabled:opacity-40"
                >
                  {d}
                </button>
              ))}
              <button
                onClick={clearPin}
                disabled={submitting || lockoutMs > 0}
                className="rounded-xl bg-slate-900/40 py-5 text-xs font-medium text-slate-400 ring-1 ring-slate-800 transition hover:bg-slate-800/60 active:scale-95 disabled:opacity-40"
              >
                Сброс
              </button>
              <button
                onClick={() => appendDigit('0')}
                disabled={submitting || lockoutMs > 0}
                className="rounded-xl bg-slate-900/70 py-5 text-2xl font-semibold text-slate-100 ring-1 ring-slate-800 transition hover:bg-slate-800/80 active:scale-95 disabled:opacity-40"
              >
                0
              </button>
              <button
                onClick={backspace}
                disabled={submitting || lockoutMs > 0}
                className="flex items-center justify-center rounded-xl bg-slate-900/40 py-5 text-slate-400 ring-1 ring-slate-800 transition hover:bg-slate-800/60 active:scale-95 disabled:opacity-40"
              >
                <Delete className="h-5 w-5" />
              </button>
            </div>

            {submitting && (
              <div className="flex justify-center">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
              </div>
            )}
          </div>
        )}

        <p className="text-center text-[10px] text-slate-600">
          Нужен доступ владельца?{' '}
          <a href="/login" className="text-slate-400 underline-offset-2 hover:underline">
            Войти с email
          </a>
        </p>
      </div>
    </div>
  )
}

export default KitchenLogin
