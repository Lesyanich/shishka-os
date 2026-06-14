import { useEffect, useMemo, useState } from 'react'
import { Search, ChevronLeft, Loader2, Tag, Printer } from 'lucide-react'
import { usePrepLabelItems, type PrepItem } from '../hooks/usePrepLabelItems'
import { usePfPackCard } from '../hooks/usePfPackCard'
import { addDays, printPrepLabel, LABEL_SIZES, DEFAULT_LABEL_SIZE } from '../lib/labelPrinting'

const LABEL_SIZE_KEY = 'kitchen_label_size'

/**
 * Kitchen label station (cook-accessible). An L1 cook picks a prep item, enters
 * the batch weight + shelf life, and prints a storage label to the XP-420B via
 * RawBT: name + prep date + weight + use-by.
 *
 * UI copy is English by default (Thai / Burmese to be added later).
 */
export function KitchenLabels() {
  const { items, isLoading, error } = usePrepLabelItems()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<PrepItem | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.product_code.toLowerCase().includes(q),
    )
  }, [items, query])

  if (selected) {
    return <LabelEditor item={selected} onBack={() => setSelected(null)} />
  }

  return (
    <div className="mx-auto max-w-2xl p-4">
      <div className="mb-4 flex items-center gap-2">
        <Tag className="h-5 w-5 text-amber-400" />
        <h1 className="text-lg font-semibold text-slate-100">Prep Labels</h1>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search prep item…"
          className="w-full rounded-xl border border-slate-700 bg-slate-900 py-3 pl-10 pr-3 text-base text-slate-100 outline-none focus:border-amber-500/60"
        />
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20 text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
          Couldn&apos;t load prep items: {error}
        </p>
      )}

      {!isLoading && !error && filtered.length === 0 && (
        <p className="py-20 text-center text-sm text-slate-500">Nothing found.</p>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {filtered.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSelected(item)}
            className="flex flex-col items-start gap-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-left transition hover:border-amber-500/50 hover:bg-slate-800"
          >
            <span className="text-sm font-medium text-slate-100">{item.name}</span>
            <span className="text-[11px] text-slate-500">{item.product_code}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function LabelEditor({ item, onBack }: { item: PrepItem; onBack: () => void }) {
  const { card } = usePfPackCard(item.id)
  const unit = item.base_unit ?? 'kg'

  const [qty, setQty] = useState('')
  const [days, setDays] = useState('')
  const [sizeId, setSizeId] = useState<string>(
    () => localStorage.getItem(LABEL_SIZE_KEY) ?? DEFAULT_LABEL_SIZE.id,
  )
  const size = LABEL_SIZES.find((s) => s.id === sizeId) ?? DEFAULT_LABEL_SIZE

  function chooseSize(id: string) {
    setSizeId(id)
    localStorage.setItem(LABEL_SIZE_KEY, id)
  }

  // Prefill shelf life from the recipe card once it loads (if set there).
  useEffect(() => {
    if (card?.shelf_life_days != null) setDays(String(card.shelf_life_days))
  }, [card])

  const qtyNum = qty.trim() === '' ? null : Number(qty)
  const qtyValid = qtyNum != null && Number.isFinite(qtyNum) && qtyNum > 0
  const daysNum = days.trim() === '' ? null : Number(days)
  const daysValid = daysNum == null || (Number.isInteger(daysNum) && daysNum > 0 && daysNum <= 365)

  const useBy = daysValid && daysNum != null ? addDays(new Date(), daysNum) : null
  const useByLabel = useBy
    ? useBy.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : '—'

  function handlePrint() {
    printPrepLabel({
      name: item.name,
      productCode: item.product_code,
      prepDate: new Date(),
      shelfLifeDays: daysValid ? daysNum : null,
      weight: qtyValid ? `${qty.trim()} ${unit}` : null,
    }, size)
  }

  return (
    <div className="mx-auto max-w-md p-4">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200"
      >
        <ChevronLeft className="h-4 w-4" /> All prep items
      </button>

      <div className="mb-5">
        <h1 className="text-lg font-semibold text-slate-100">{item.name}</h1>
        <p className="text-xs text-slate-500">{item.product_code}</p>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-4">
        {/* Weight / volume */}
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wider text-slate-400">
            Quantity ({unit})
          </span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="e.g. 1.5"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-lg text-slate-100 outline-none focus:border-amber-500/60"
            />
            <span className="text-base text-slate-400">{unit}</span>
          </div>
        </label>

        {/* Shelf life */}
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wider text-slate-400">
            Shelf life (days)
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            placeholder="e.g. 3"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-lg text-slate-100 outline-none focus:border-amber-500/60"
          />
          {!daysValid && (
            <span className="mt-1 block text-[11px] text-rose-400">Whole number, 1–365.</span>
          )}
        </label>

        {/* Use-by preview */}
        <div className="flex items-center justify-between rounded-xl bg-slate-950 px-3 py-3 text-sm">
          <span className="text-slate-400">Use by (from today)</span>
          <span className="text-base font-semibold text-slate-100">{useByLabel}</span>
        </div>

        {/* Paper size */}
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wider text-slate-400">
            Paper size
          </span>
          <select
            value={sizeId}
            onChange={(e) => chooseSize(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-base text-slate-100 outline-none focus:border-amber-500/60"
          >
            {LABEL_SIZES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        {/* Print */}
        <button
          type="button"
          onClick={handlePrint}
          disabled={!qtyValid || !daysValid}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3.5 text-base font-semibold text-black transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Printer className="h-5 w-5" /> Print label
        </button>
        <p className="text-center text-[11px] text-slate-500">
          Prints on the tablet via RawBT → XP-420B
        </p>
      </div>
    </div>
  )
}
