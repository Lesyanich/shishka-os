import { useMemo, useState, type FormEvent } from 'react'
import { Check, Loader2, Minus, Plus, Search, Send, UtensilsCrossed } from 'lucide-react'
import { useStockSheet } from '../hooks/useStockSheet'
import {
  STORAGE_LABELS,
  STORAGE_OPTIONS,
  type StockSheetItem,
  type StockSheetLineInput,
  type StockStatus,
  type StorageLocation,
} from '../types/stockSheet'

interface RowState {
  status: StockStatus | null
  qty: number
}

const emptyRow = (): RowState => ({ status: null, qty: 0 })

const STATUSES: { key: StockStatus; label: string; active: string }[] = [
  { key: 'out', label: 'Out', active: 'bg-rose-500 text-white' },
  { key: 'low', label: 'Low', active: 'bg-amber-500 text-amber-950' },
  { key: 'in', label: 'In', active: 'bg-emerald-500 text-emerald-950' },
]

/**
 * Public, PIN-gated staff stock-order sheet (/stock).
 * Compact checklist: pick a status (Out / Low / In) and an order quantity per
 * item. A row is actionable when status is Out/Low or it has an order qty.
 * Runs on the anon Supabase key — no login.
 */
export function StockSheetPage() {
  const { items, isLoading, error, submit, isSubmitting } = useStockSheet()

  const [phase, setPhase] = useState<'gate' | 'sheet' | 'done'>('gate')
  const [passcode, setPasscode] = useState('')
  const [gateError, setGateError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  const [rows, setRows] = useState<Record<string, RowState>>({})
  const [search, setSearch] = useState('')
  const [onlyMarked, setOnlyMarked] = useState(false)
  const [onlyMenu, setOnlyMenu] = useState(false)
  const [locFilter, setLocFilter] = useState<StorageLocation | null>(null)
  const [catFilter, setCatFilter] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submittedCount, setSubmittedCount] = useState(0)

  const getRow = (id: string): RowState => rows[id] ?? emptyRow()
  // Actionable = needs ordering (Out/Low) or has a quantity. "In" alone is not.
  const isMarked = (r: RowState) => r.status === 'out' || r.status === 'low' || r.qty > 0

  const setStatus = (id: string, s: StockStatus) =>
    setRows((prev) => {
      const cur = prev[id] ?? emptyRow()
      return { ...prev, [id]: { ...cur, status: cur.status === s ? null : s } }
    })
  const bumpQty = (id: string, delta: number) =>
    setRows((prev) => {
      const cur = prev[id] ?? emptyRow()
      return { ...prev, [id]: { ...cur, qty: Math.max(0, cur.qty + delta) } }
    })

  const markedCount = useMemo(
    () => Object.values(rows).filter(isMarked).length,
    [rows],
  )

  // Filter (search + marked) then group by category in the view's order.
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase()
    const out: { key: string; name: string; items: StockSheetItem[] }[] = []
    const index = new Map<string, number>()
    for (const it of items) {
      if (q && !it.name.toLowerCase().includes(q)) continue
      if (onlyMarked && !isMarked(getRow(it.id))) continue
      if (onlyMenu && !it.in_active_menu) continue
      if (locFilter && it.storage_location !== locFilter) continue
      const catKey = it.category_code ?? it.category_name
      if (catFilter && catKey !== catFilter) continue
      const key = catKey
      let i = index.get(key)
      if (i === undefined) {
        i = out.length
        index.set(key, i)
        out.push({ key, name: it.category_name, items: [] })
      }
      out[i].items.push(it)
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, search, onlyMarked, onlyMenu, locFilter, catFilter, rows])

  // Only offer location chips that actually have items on the sheet.
  const availableLocations = useMemo(() => {
    const present = new Set(items.map((it) => it.storage_location).filter(Boolean))
    return STORAGE_OPTIONS.filter((l) => present.has(l))
  }, [items])

  // Distinct categories present on the sheet, in menu (category_sort) order.
  const categories = useMemo(() => {
    const seen = new Map<string, string>()
    for (const it of items) {
      const key = it.category_code ?? it.category_name
      if (!seen.has(key)) seen.set(key, it.category_name)
    }
    return Array.from(seen, ([key, name]) => ({ key, name }))
  }, [items])

  async function handleGate(e: FormEvent) {
    e.preventDefault()
    setGateError(null)
    setChecking(true)
    const probe = await submit(passcode.trim(), null, [])
    setChecking(false)
    if (probe.error === 'bad_passcode') {
      setGateError('Wrong code')
      return
    }
    setPhase('sheet')
  }

  async function handleSubmit() {
    setSubmitError(null)
    const lines: StockSheetLineInput[] = items
      .map((it) => ({ it, r: getRow(it.id) }))
      .filter(({ r }) => isMarked(r))
      .map(({ it, r }) => ({
        nomenclature_id: it.id,
        status: r.status ?? 'in',
        order_qty: r.qty > 0 ? r.qty : null,
      }))

    if (lines.length === 0) {
      setSubmitError('Mark at least one item')
      return
    }

    const res = await submit(passcode.trim(), null, lines)
    if (!res.ok) {
      if (res.error === 'bad_passcode') {
        setPhase('gate')
        setGateError('Wrong code')
        return
      }
      setSubmitError(res.error ?? 'Failed to submit')
      return
    }
    setSubmittedCount(res.line_count ?? lines.length)
    setPhase('done')
  }

  // ── Passcode gate ──────────────────────────────────────────────────────────
  if (phase === 'gate') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0b0d] px-6">
        <form onSubmit={handleGate} className="w-full max-w-[280px] space-y-7">
          <div className="flex flex-col items-center gap-3">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
              <UtensilsCrossed className="h-7 w-7" />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-zinc-50">Stock Sheet</h1>
            <p className="text-xs text-zinc-500">Enter code</p>
          </div>
          <input
            autoFocus
            inputMode="numeric"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="••••"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-3.5 text-center text-2xl tracking-[0.6em] text-zinc-50 outline-none transition focus:border-emerald-500/60 focus:bg-zinc-900"
          />
          {gateError && <p className="text-center text-xs text-rose-400">{gateError}</p>}
          <button
            type="submit"
            disabled={checking || !passcode.trim()}
            className="flex w-full items-center justify-center rounded-xl bg-emerald-500 py-3.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-40"
          >
            {checking ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Open'}
          </button>
        </form>
      </div>
    )
  }

  // ── Success ────────────────────────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-[#0a0b0d] px-8 text-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/25">
          <Check className="h-10 w-10" strokeWidth={2.5} />
        </span>
        <div className="space-y-1">
          <h1 className="text-xl font-bold tracking-tight text-zinc-50">Sent</h1>
          <p className="text-sm text-zinc-500">
            {submittedCount} item{submittedCount === 1 ? '' : 's'} reported
          </p>
        </div>
        <button
          onClick={() => {
            setRows({})
            setSearch('')
            setOnlyMarked(false)
            setSubmittedCount(0)
            setPhase('sheet')
          }}
          className="mt-1 rounded-xl border border-zinc-800 px-5 py-2.5 text-xs font-medium text-zinc-300 transition hover:bg-zinc-900 active:scale-[0.98]"
        >
          New sheet
        </button>
      </div>
    )
  }

  // ── Sheet ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0b0d] pb-24 text-zinc-100">
      {/* Header + search */}
      <header className="sticky top-0 z-20 border-b border-zinc-800/80 bg-[#0a0b0d]/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-baseline justify-between px-4 pt-3">
          <h1 className="text-base font-bold tracking-tight text-zinc-50">Stock Order</h1>
          <span className="text-xs font-semibold tabular-nums text-emerald-400">
            {markedCount}
          </span>
        </div>
        <div className="mx-auto flex max-w-md items-center gap-2 px-4 py-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900/60 pl-9 pr-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-zinc-700"
            />
          </div>
          <button
            onClick={() => setOnlyMarked((v) => !v)}
            className={`h-9 shrink-0 rounded-lg border px-3 text-xs font-semibold transition active:scale-95 ${
              onlyMarked
                ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                : 'border-zinc-800 text-zinc-400'
            }`}
          >
            Marked
          </button>
        </div>

        {/* Filter chips: on-menu + storage location */}
        <div className="mx-auto flex max-w-md items-center gap-1.5 overflow-x-auto px-4 pb-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            onClick={() => setOnlyMenu((v) => !v)}
            className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold transition active:scale-95 ${
              onlyMenu
                ? 'border-sky-500/50 bg-sky-500/15 text-sky-300'
                : 'border-zinc-800 text-zinc-400'
            }`}
          >
            On menu
          </button>
          {availableLocations.length > 0 && <span className="h-4 w-px shrink-0 bg-zinc-800" />}
          {availableLocations.map((loc) => (
            <button
              key={loc}
              onClick={() => setLocFilter((cur) => (cur === loc ? null : loc))}
              className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold transition active:scale-95 ${
                locFilter === loc
                  ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                  : 'border-zinc-800 text-zinc-400'
              }`}
            >
              {STORAGE_LABELS[loc].en}
            </button>
          ))}
        </div>

        {/* Category chips */}
        {categories.length > 1 && (
          <div className="mx-auto flex max-w-md items-center gap-1.5 overflow-x-auto px-4 pb-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {categories.map((c) => (
              <button
                key={c.key}
                onClick={() => setCatFilter((cur) => (cur === c.key ? null : c.key))}
                className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-semibold transition active:scale-95 ${
                  catFilter === c.key
                    ? 'border-violet-500/50 bg-violet-500/15 text-violet-300'
                    : 'border-zinc-800 text-zinc-400'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="mx-auto max-w-md px-3 py-3">
        {isLoading && (
          <div className="flex justify-center py-24 text-zinc-600">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            {error}
          </div>
        )}

        {groups.map((g) => (
          <section key={g.key} className="mb-4">
            <div className="sticky top-[188px] z-10 -mx-3 mb-1.5 bg-[#0a0b0d]/95 px-4 py-1.5 backdrop-blur">
              <h2 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
                <span className="h-1 w-1 rounded-full bg-emerald-500/70" />
                {g.name}
                <span className="ml-auto font-normal tabular-nums text-zinc-700">
                  {g.items.length}
                </span>
              </h2>
            </div>

            <ul className="overflow-hidden rounded-xl border border-zinc-800/70">
              {g.items.map((it, idx) => {
                const r = getRow(it.id)
                const storage = it.storage_location ? STORAGE_LABELS[it.storage_location] : null
                const accent =
                  r.status === 'out'
                    ? 'bg-rose-500'
                    : r.status === 'low'
                      ? 'bg-amber-500'
                      : r.status === 'in'
                        ? 'bg-emerald-500'
                        : r.qty > 0
                          ? 'bg-emerald-500'
                          : ''
                return (
                  <li
                    key={it.id}
                    className={`relative px-3 py-2.5 ${
                      idx > 0 ? 'border-t border-zinc-800/60' : ''
                    } ${
                      r.status === 'out'
                        ? 'bg-rose-500/[0.06]'
                        : r.status === 'low'
                          ? 'bg-amber-500/[0.05]'
                          : r.qty > 0
                            ? 'bg-emerald-500/[0.05]'
                            : 'bg-zinc-900/30'
                    }`}
                  >
                    {accent && <span className={`absolute inset-y-0 left-0 w-[3px] ${accent}`} />}

                    {/* Line 1: name + meta */}
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm leading-tight text-zinc-100">
                        {it.emoji ? `${it.emoji} ` : ''}
                        {it.name}
                      </p>
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-zinc-600">
                        {storage ? storage.en : it.base_unit}
                      </span>
                    </div>

                    {/* Line 2: status segmented + qty stepper */}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex overflow-hidden rounded-lg border border-zinc-800">
                        {STATUSES.map((s, i) => (
                          <button
                            key={s.key}
                            type="button"
                            onClick={() => setStatus(it.id, s.key)}
                            className={`px-3 py-1.5 text-[11px] font-bold leading-none transition active:scale-95 ${
                              i > 0 ? 'border-l border-zinc-800' : ''
                            } ${
                              r.status === s.key
                                ? s.active
                                : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'
                            }`}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>

                      <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-zinc-800/80 p-0.5">
                        <button
                          type="button"
                          onClick={() => bumpQty(it.id, -1)}
                          disabled={r.qty === 0}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition hover:bg-zinc-700 active:scale-90 disabled:opacity-30"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span
                          className={`w-6 text-center text-sm font-bold tabular-nums ${
                            r.qty > 0 ? 'text-emerald-300' : 'text-zinc-600'
                          }`}
                        >
                          {r.qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => bumpQty(it.id, 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/90 text-emerald-950 transition hover:bg-emerald-400 active:scale-90"
                        >
                          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}

        {!isLoading && groups.length === 0 && !error && (
          <p className="py-20 text-center text-sm text-zinc-600">
            {onlyMarked ? 'Nothing marked yet' : 'No items'}
          </p>
        )}
      </div>

      {/* Sticky submit */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-800/80 bg-[#0a0b0d]/95 px-3 py-3 backdrop-blur">
        <div className="mx-auto max-w-md">
          {submitError && (
            <p className="mb-2 text-center text-[11px] text-rose-400">{submitError}</p>
          )}
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || markedCount === 0}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3.5 text-sm font-bold text-emerald-950 transition hover:bg-emerald-400 active:scale-[0.99] disabled:bg-zinc-800 disabled:text-zinc-600"
          >
            {isSubmitting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <Send className="h-4 w-4" />
                Send {markedCount > 0 && <span className="tabular-nums">({markedCount})</span>}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
