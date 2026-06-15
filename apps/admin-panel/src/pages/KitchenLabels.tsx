import { useEffect, useMemo, useState } from 'react'
import { Search, ChevronLeft, Loader2, Tag, Printer, Trash2 } from 'lucide-react'
import { usePrepLabelItems, type PrepItem } from '../hooks/usePrepLabelItems'
import { usePfPackCard } from '../hooks/usePfPackCard'
import { usePrepBatches, type PrepBatch } from '../hooks/usePrepBatches'
import { useLocations } from '../hooks/useLocations'
import { useAppRole } from '../contexts/AppRoleContext'
import { addDays, printPrepLabel, LABEL_SIZES, DEFAULT_LABEL_SIZE } from '../lib/labelPrinting'

const LABEL_SIZE_KEY = 'kitchen_label_size'
const LABEL_LOCATION_KEY = 'kitchen_label_location'
const LABEL_GAP_KEY = 'kitchen_label_gap_mm'

/** Inter-label gap options (mm) added below the content to stop label drift. */
const GAP_OPTIONS = ['0', '2', '3', '4']
const DEFAULT_GAP = '3'

const DAY_MS = 86_400_000
const shortDate = (iso: string | Date) =>
  new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })
const shelfDaysOf = (b: PrepBatch) =>
  Math.max(1, Math.round((new Date(b.expires_at).getTime() - new Date(b.produced_at).getTime()) / DAY_MS))

/**
 * Kitchen label station (cook-accessible). An L1 cook picks a prep item, enters
 * the batch weight + shelf life, and prints a storage label to the XP-420B via
 * RawBT. Each print records a batch in inventory_batches (with its own ID + QR
 * barcode), and the recorded batches are listed below for delete / reprint.
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
  const { staffId } = useAppRole()
  const { locations } = useLocations()
  const { batches, create, remove } = usePrepBatches(item.id)
  const unit = item.base_unit ?? 'kg'

  const [qty, setQty] = useState('')
  const [days, setDays] = useState('')
  const [printing, setPrinting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const [sizeId, setSizeId] = useState<string>(
    () => localStorage.getItem(LABEL_SIZE_KEY) ?? DEFAULT_LABEL_SIZE.id,
  )
  const size = LABEL_SIZES.find((s) => s.id === sizeId) ?? DEFAULT_LABEL_SIZE

  const [locationId, setLocationId] = useState<string>(
    () => localStorage.getItem(LABEL_LOCATION_KEY) ?? '',
  )
  // Default to the L1 kitchen location once locations load (if none chosen yet).
  useEffect(() => {
    if (locationId || locations.length === 0) return
    const kitchen = locations.find((l) => l.type === 'kitchen') ?? locations[0]
    setLocationId(kitchen.id)
  }, [locations, locationId])

  const [gapMm, setGapMm] = useState<string>(
    () => localStorage.getItem(LABEL_GAP_KEY) ?? DEFAULT_GAP,
  )

  function chooseSize(id: string) {
    setSizeId(id)
    localStorage.setItem(LABEL_SIZE_KEY, id)
  }
  function chooseGap(mm: string) {
    setGapMm(mm)
    localStorage.setItem(LABEL_GAP_KEY, mm)
  }
  function chooseLocation(id: string) {
    setLocationId(id)
    localStorage.setItem(LABEL_LOCATION_KEY, id)
  }

  // Prefill shelf life from the recipe card once it loads (if set there).
  useEffect(() => {
    if (card?.shelf_life_days != null) setDays(String(card.shelf_life_days))
  }, [card])

  const qtyNum = qty.trim() === '' ? null : Number(qty)
  const qtyValid = qtyNum != null && Number.isFinite(qtyNum) && qtyNum > 0
  const daysNum = days.trim() === '' ? null : Number(days)
  const daysValid = daysNum != null && Number.isInteger(daysNum) && daysNum > 0 && daysNum <= 365

  const useBy = daysValid ? addDays(new Date(), daysNum) : null
  const useByLabel = useBy ? shortDate(useBy) : '—'

  const canPrint = qtyValid && daysValid && !!locationId && !printing

  function printBatch(b: PrepBatch) {
    printPrepLabel(
      {
        name: item.name,
        productCode: item.product_code,
        prepDate: new Date(b.produced_at),
        shelfLifeDays: shelfDaysOf(b),
        weight: `${b.weight} ${unit}`,
        qr: b.barcode,
        batchCode: b.batch_code ?? b.barcode,
      },
      size,
      true, // launch RawBT via intent each job (fixes "only first print works")
      Number(gapMm) || 0, // pad image to full label pitch → no drift
    )
  }

  async function handlePrint() {
    if (!canPrint || qtyNum == null || daysNum == null) return
    setPrinting(true)
    setActionError(null)
    const res = await create({
      nomenclatureId: item.id,
      productCode: item.product_code,
      weight: qtyNum,
      shelfLifeDays: daysNum,
      locationId,
      producedBy: staffId,
    })
    setPrinting(false)
    if (!res.ok || !res.batch) {
      setActionError(res.error ?? 'Could not record batch')
      return
    }
    printBatch(res.batch)
    setQty('')
  }

  async function handleDelete(b: PrepBatch) {
    setActionError(null)
    const res = await remove(b.id)
    if (!res.ok) setActionError(res.error ?? 'Could not delete batch')
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
        </label>

        {/* Use-by preview */}
        <div className="flex items-center justify-between rounded-xl bg-slate-950 px-3 py-3 text-sm">
          <span className="text-slate-400">Use by (from today)</span>
          <span className="text-base font-semibold text-slate-100">{useByLabel}</span>
        </div>

        {/* Location */}
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wider text-slate-400">
            Location
          </span>
          <select
            value={locationId}
            onChange={(e) => chooseLocation(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-base text-slate-100 outline-none focus:border-amber-500/60"
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>

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

        {/* Gap (drift fix): extra feed below the content = inter-label gap */}
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wider text-slate-400">
            Gap (mm) — increase if labels drift down
          </span>
          <select
            value={gapMm}
            onChange={(e) => chooseGap(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-base text-slate-100 outline-none focus:border-amber-500/60"
          >
            {GAP_OPTIONS.map((g) => (
              <option key={g} value={g}>
                {g} mm
              </option>
            ))}
          </select>
        </label>

        {actionError && <p className="text-sm text-rose-400">{actionError}</p>}

        {/* Print + record */}
        <button
          type="button"
          onClick={handlePrint}
          disabled={!canPrint}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3.5 text-base font-semibold text-black transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {printing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Printer className="h-5 w-5" />}
          Print &amp; record batch
        </button>
        <p className="text-center text-[11px] text-slate-500">
          Records the batch + prints a QR label via RawBT → XP-420B
        </p>
      </div>

      {/* Recorded batches */}
      <RecordedBatches batches={batches} unit={unit} onReprint={printBatch} onDelete={handleDelete} />
    </div>
  )
}

function RecordedBatches({
  batches,
  unit,
  onReprint,
  onDelete,
}: {
  batches: PrepBatch[]
  unit: string
  onReprint: (b: PrepBatch) => void
  onDelete: (b: PrepBatch) => void
}) {
  if (batches.length === 0) {
    return (
      <p className="mt-6 text-center text-xs text-slate-600">No batches recorded yet.</p>
    )
  }

  return (
    <div className="mt-6">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Recorded batches ({batches.length})
      </h2>
      <div className="space-y-2">
        {batches.map((b) => (
          <div
            key={b.id}
            className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-xs text-slate-200">{b.batch_code ?? b.barcode}</p>
              <p className="text-[11px] text-slate-500">
                {b.weight} {unit} · made {shortDate(b.produced_at)} · use by {shortDate(b.expires_at)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onReprint(b)}
              title="Reprint label"
              className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:border-amber-500/50 hover:text-amber-300"
            >
              <Printer className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(b)}
              title="Delete batch"
              className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:border-rose-500/50 hover:text-rose-400"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
