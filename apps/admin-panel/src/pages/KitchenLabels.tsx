import { useEffect, useMemo, useState } from 'react'
import { Search, ChevronLeft, Loader2, Tag, Printer, Trash2, Usb, Plus } from 'lucide-react'
import { usePrepLabelItems, type PrepItem, type PrepItemKind } from '../hooks/usePrepLabelItems'
import { usePfPackCard } from '../hooks/usePfPackCard'
import { usePrepBatches, type PrepBatch } from '../hooks/usePrepBatches'
import { useLocations } from '../hooks/useLocations'
import { useAppRole } from '../contexts/AppRoleContext'
import { addDays, printPrepLabel, LABEL_SIZES, DEFAULT_LABEL_SIZE } from '../lib/labelPrinting'
import { renderPrepLabelTSPL } from '../lib/labelTspl'
import {
  isWebUsbSupported,
  getGrantedPrinter,
  requestPrinter,
  sendRawViaUSB,
  type UsbDevice,
} from '../lib/webusbPrint'

const LABEL_SIZE_KEY = 'kitchen_label_size'
const LABEL_LOCATION_KEY = 'kitchen_label_location'
const LABEL_TRANSPORT_KEY = 'kitchen_label_transport'

type Transport = 'usb' | 'bluetooth'

const DAY_MS = 86_400_000
const shortDate = (iso: string | Date) =>
  new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })
const shelfDaysOf = (b: PrepBatch) =>
  Math.max(1, Math.round((new Date(b.expires_at).getTime() - new Date(b.produced_at).getTime()) / DAY_MS))

/** PF / Sale filter chips for the item list. */
type KindFilter = 'all' | PrepItemKind
const KIND_FILTERS: { id: KindFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'PF', label: 'Preps (PF)' },
  { id: 'SALE', label: 'Dishes (Sale)' },
]

/** Small colored badge marking an item as a PF prep or a SALE dish. */
function KindBadge({ kind }: { kind: PrepItemKind }) {
  const styles =
    kind === 'SALE'
      ? 'bg-emerald-900/40 text-emerald-300'
      : 'bg-amber-900/40 text-amber-300'
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles}`}>
      {kind === 'SALE' ? 'Sale' : 'PF'}
    </span>
  )
}

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
  const [kind, setKind] = useState<KindFilter>('all')
  const [selected, setSelected] = useState<PrepItem | null>(null)

  const counts = useMemo(
    () => ({
      all: items.length,
      PF: items.filter((i) => i.kind === 'PF').length,
      SALE: items.filter((i) => i.kind === 'SALE').length,
    }),
    [items],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((i) => {
      if (kind !== 'all' && i.kind !== kind) return false
      if (!q) return true
      return (
        i.name.toLowerCase().includes(q) ||
        i.product_code.toLowerCase().includes(q)
      )
    })
  }, [items, query, kind])

  if (selected) {
    return <LabelEditor item={selected} onBack={() => setSelected(null)} />
  }

  return (
    <div className="mx-auto max-w-2xl p-4">
      <div className="mb-4 flex items-center gap-2">
        <Tag className="h-5 w-5 text-amber-400" />
        <h1 className="text-lg font-semibold text-slate-100">Kitchen Labels</h1>
      </div>

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search item…"
          className="w-full rounded-xl border border-slate-700 bg-slate-900 py-3 pl-10 pr-3 text-base text-slate-100 outline-none focus:border-amber-500/60"
        />
      </div>

      <div className="mb-4 flex gap-2">
        {KIND_FILTERS.map((f) => {
          const active = kind === f.id
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setKind(f.id)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                active
                  ? 'border-amber-500/60 bg-amber-500/15 text-amber-300'
                  : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600 hover:text-slate-200'
              }`}
            >
              {f.label}
              <span className="ml-1.5 text-xs text-slate-500">{counts[f.id]}</span>
            </button>
          )
        })}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20 text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
          Couldn&apos;t load items: {error}
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
            <div className="flex w-full items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-100">{item.name}</span>
              <KindBadge kind={item.kind} />
            </div>
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
  const [usbDevice, setUsbDevice] = useState<UsbDevice | null>(null)

  // Pick up an already-granted printer on mount (no chooser needed).
  useEffect(() => {
    getGrantedPrinter().then(setUsbDevice).catch(() => {})
  }, [])

  async function connectPrinter() {
    setActionError(null)
    const d = await requestPrinter()
    if (d) setUsbDevice(d)
    else setActionError('Printer not selected.')
  }

  const [transport, setTransport] = useState<Transport>(
    () => (localStorage.getItem(LABEL_TRANSPORT_KEY) as Transport | null) ?? 'usb',
  )
  function chooseTransport(t: Transport) {
    setTransport(t)
    localStorage.setItem(LABEL_TRANSPORT_KEY, t)
  }

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

  function chooseSize(id: string) {
    setSizeId(id)
    localStorage.setItem(LABEL_SIZE_KEY, id)
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

  async function printBatch(b: PrepBatch) {
    // Bluetooth fallback: RawBT can only rasterize a PNG (ESC/POS) — may drift.
    if (transport === 'bluetooth') {
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
        true, // launch RawBT via intent each job
      )
      return
    }

    // USB (recommended): native TSPL, self-registers to the gap, no drift.
    const bytes = new TextEncoder().encode(
      renderPrepLabelTSPL(
        {
          name: item.name,
          prepDate: new Date(b.produced_at),
          shelfLifeDays: shelfDaysOf(b),
          weight: `${b.weight} ${unit}`,
          qr: b.barcode,
          batchCode: b.batch_code ?? b.barcode,
        },
        size,
      ),
    )
    const device = usbDevice ?? (await getGrantedPrinter())
    if (!device) {
      setActionError('Connect the USB printer first (button below).')
      return
    }
    setUsbDevice(device)
    try {
      await sendRawViaUSB(device, bytes)
    } catch (e) {
      setUsbDevice(null)
      setActionError(`USB print failed: ${(e as Error).message} — reconnect the printer.`)
    }
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
    await printBatch(res.batch)
    setQty('')
  }

  // Record a batch WITHOUT printing — it lands in the list below; print later.
  async function handleAddBatch() {
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
    if (!res.ok) {
      setActionError(res.error ?? 'Could not record batch')
      return
    }
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

        {/* Transport: USB (TSPL, perfect) or Bluetooth (RawBT, may drift) */}
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wider text-slate-400">
            Print via
          </span>
          <select
            value={transport}
            onChange={(e) => chooseTransport(e.target.value as Transport)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-base text-slate-100 outline-none focus:border-amber-500/60"
          >
            <option value="usb">USB (recommended)</option>
            <option value="bluetooth">Bluetooth (RawBT, may misalign)</option>
          </select>
        </label>

        {/* USB connection — only relevant for the USB transport */}
        {transport === 'usb' &&
          (!isWebUsbSupported() ? (
            <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-[12px] text-amber-300">
              This browser can&apos;t reach the USB printer. Open the panel in Chrome on the tablet.
            </p>
          ) : usbDevice ? (
            <p className="flex items-center gap-1.5 text-[12px] text-emerald-400">
              <Usb className="h-4 w-4" /> Printer connected
            </p>
          ) : (
            <button
              type="button"
              onClick={connectPrinter}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-600 py-2.5 text-sm font-medium text-slate-200 hover:border-amber-500/50"
            >
              <Usb className="h-4 w-4" /> Connect printer (USB)
            </button>
          ))}

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

        <button
          type="button"
          onClick={handleAddBatch}
          disabled={!canPrint}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-600 py-3 text-sm font-medium text-slate-200 transition hover:border-amber-500/50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="h-4 w-4" /> Add batch (no print)
        </button>

        <p className="text-center text-[11px] text-slate-500">
          {transport === 'usb'
            ? 'Records the batch + prints a native TSPL label over USB'
            : 'Records the batch + prints via RawBT over Bluetooth (may misalign)'}
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
