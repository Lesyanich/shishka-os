import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Search,
  ChevronLeft,
  Loader2,
  Tag,
  Printer,
  Trash2,
  Usb,
  Plus,
  LayoutGrid,
  ClipboardList,
} from 'lucide-react'
import { usePrepLabelItems, type PrepItem, type PrepItemKind } from '../hooks/usePrepLabelItems'
import { usePfPackCard } from '../hooks/usePfPackCard'
import { usePrepBatches, type PrepBatch } from '../hooks/usePrepBatches'
import { useAllPrepBatches, type AllPrepBatch } from '../hooks/useAllPrepBatches'
import { useSaleLabelInfo, type SaleLabelInfo } from '../hooks/useSaleLabelInfo'
import { useLocations } from '../hooks/useLocations'
import { useAppRole } from '../contexts/AppRoleContext'
import {
  addDays,
  printPrepLabel,
  LABEL_SIZES,
  DEFAULT_LABEL_SIZE,
  type LabelNutrition,
} from '../lib/labelPrinting'
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
const shortDateTime = (iso: string | Date) =>
  new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
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

/** One category section in the picker (leaf category + its items). */
interface CatGroup {
  key: string
  name: string
  sort: number
  items: PrepItem[]
}

/** Bucket items by their leaf category, ordered by category sort then name. */
function groupByCategory(list: PrepItem[]): CatGroup[] {
  const map = new Map<string, CatGroup>()
  for (const it of list) {
    const key = it.categoryId ?? 'uncategorized'
    let g = map.get(key)
    if (!g) {
      g = {
        key,
        name: it.categoryName ?? 'Uncategorized',
        sort: it.categoryId ? it.categorySort : Number.MAX_SAFE_INTEGER,
        items: [],
      }
      map.set(key, g)
    }
    g.items.push(it)
  }
  return [...map.values()].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
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
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<KindFilter>('all')
  // Active-only by default — hide archived / discontinued items.
  const [activeOnly, setActiveOnly] = useState(true)

  // Selection + view live in the URL so the link reflects the open item, the
  // back button works, and a label page can be deep-linked / refreshed.
  const itemCode = searchParams.get('item')
  const view: 'items' | 'log' = searchParams.get('view') === 'log' ? 'log' : 'items'
  const selected = useMemo(
    () => (itemCode ? items.find((i) => i.product_code === itemCode) ?? null : null),
    [items, itemCode],
  )

  function openItem(productCode: string) {
    const next = new URLSearchParams(searchParams)
    next.set('item', productCode)
    setSearchParams(next)
  }
  function closeItem() {
    const next = new URLSearchParams(searchParams)
    next.delete('item')
    setSearchParams(next)
  }
  function setView(v: 'items' | 'log') {
    const next = new URLSearchParams(searchParams)
    if (v === 'log') next.set('view', 'log')
    else next.delete('view')
    setSearchParams(next, { replace: true })
  }

  // Active filter applies before the kind counts so the chips match what shows.
  const visible = useMemo(
    () => (activeOnly ? items.filter((i) => i.isAvailable) : items),
    [items, activeOnly],
  )

  const counts = useMemo(
    () => ({
      all: visible.length,
      PF: visible.filter((i) => i.kind === 'PF').length,
      SALE: visible.filter((i) => i.kind === 'SALE').length,
    }),
    [visible],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return visible.filter((i) => {
      if (kind !== 'all' && i.kind !== kind) return false
      if (!q) return true
      return (
        i.name.toLowerCase().includes(q) ||
        i.product_code.toLowerCase().includes(q)
      )
    })
  }, [visible, query, kind])

  // Group the filtered items into category sections, ordered by category sort.
  const sections = useMemo(() => groupByCategory(filtered), [filtered])
  const inactiveCount = items.length - items.filter((i) => i.isAvailable).length

  if (selected) {
    return <LabelEditor item={selected} onBack={closeItem} />
  }

  // Deep link to ?item=… while the list is still loading: hold for resolution
  // rather than flashing the picker.
  if (itemCode && isLoading) {
    return (
      <div className="mx-auto max-w-2xl p-4">
        <div className="flex items-center justify-center py-20 text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl p-4">
      <div className="mb-4 flex items-center gap-2">
        <Tag className="h-5 w-5 text-amber-400" />
        <h1 className="text-lg font-semibold text-slate-100">Kitchen Labels</h1>
      </div>

      {/* View toggle: pick an item to print vs. the global production log */}
      <div className="mb-4 flex gap-1 rounded-xl border border-slate-800 bg-slate-900/60 p-1">
        <button
          type="button"
          onClick={() => setView('items')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition ${
            view === 'items'
              ? 'bg-slate-800 text-amber-300'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <LayoutGrid className="h-4 w-4" /> Print labels
        </button>
        <button
          type="button"
          onClick={() => setView('log')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition ${
            view === 'log'
              ? 'bg-slate-800 text-amber-300'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ClipboardList className="h-4 w-4" /> All batches
        </button>
      </div>

      {view === 'log' ? (
        <AllBatchesLog onOpen={openItem} />
      ) : (
        <>
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

          <div className="mb-4 flex flex-wrap items-center gap-2">
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
            <button
              type="button"
              onClick={() => setActiveOnly((v) => !v)}
              title={
                activeOnly
                  ? `Showing active only — ${inactiveCount} hidden`
                  : 'Showing all statuses'
              }
              className={`ml-auto rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                activeOnly
                  ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                  : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600 hover:text-slate-200'
              }`}
            >
              {activeOnly ? 'Active only' : 'All statuses'}
              {activeOnly && inactiveCount > 0 && (
                <span className="ml-1.5 text-xs text-emerald-400/60">{inactiveCount} hidden</span>
              )}
            </button>
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

          <div className="space-y-5">
            {sections.map((sec) => (
              <section key={sec.key}>
                <div className="mb-2 flex items-baseline gap-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {sec.name}
                  </h2>
                  <span className="text-[11px] text-slate-600">{sec.items.length}</span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {sec.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openItem(item.product_code)}
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
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Global production log — every recorded batch across all items (PF + SALE),
 * newest first: what was made, when it was made, and when its sticker was
 * printed. Tapping a row opens that item's editor (to reprint); the trash
 * button removes a mistaken record.
 */
function AllBatchesLog({ onOpen }: { onOpen: (productCode: string) => void }) {
  const { batches, isLoading, error, remove } = useAllPrepBatches()

  async function handleDelete(b: AllPrepBatch) {
    if (!window.confirm(`Delete batch ${b.batch_code ?? b.barcode}?`)) return
    await remove(b.id)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
      </div>
    )
  }

  if (error) {
    return (
      <p className="rounded-lg bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
        Couldn&apos;t load batches: {error}
      </p>
    )
  }

  if (batches.length === 0) {
    return <p className="py-20 text-center text-sm text-slate-500">No batches recorded yet.</p>
  }

  return (
    <div className="space-y-2">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
        All batches ({batches.length})
      </p>
      {batches.map((b) => {
        const unit = b.base_unit ?? 'kg'
        return (
          <div
            key={b.id}
            className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5"
          >
            <button
              type="button"
              onClick={() => onOpen(b.product_code)}
              className="min-w-0 flex-1 text-left"
              title="Open item to reprint"
            >
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-slate-100">{b.name}</span>
                <KindBadge kind={b.kind} />
              </div>
              <p className="truncate font-mono text-[11px] text-slate-500">
                {b.batch_code ?? b.barcode}
              </p>
              <p className="text-[11px] text-slate-400">
                {b.weight} {unit} · made {shortDateTime(b.produced_at)} · use by{' '}
                {shortDate(b.expires_at)}
              </p>
              <p className="flex items-center gap-1 text-[11px] text-slate-500">
                <Printer className="h-3 w-3" /> sticker {shortDateTime(b.created_at)}
              </p>
            </button>
            <button
              type="button"
              onClick={() => handleDelete(b)}
              title="Delete batch"
              className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:border-rose-500/50 hover:text-rose-400"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Per-portion nutrition for a SALE label. КБЖУ is stored per base_unit (for a
 * SALE dish that's per piece / portion), so scaling by the labeled quantity
 * gives the macros for what's in the container. Returns null when there's no
 * calorie data to print.
 */
function saleNutritionFor(info: SaleLabelInfo | null, qty: number): LabelNutrition | null {
  if (!info || info.calories == null) return null
  return {
    kcal: info.calories * qty,
    protein: (info.protein ?? 0) * qty,
    fat: (info.fat ?? 0) * qty,
    carbs: (info.carbs ?? 0) * qty,
  }
}

function LabelEditor({ item, onBack }: { item: PrepItem; onBack: () => void }) {
  const isSale = item.kind === 'SALE'
  const { card } = usePfPackCard(item.id)
  const { info: saleInfo } = useSaleLabelInfo(item.id, isSale)
  const { staffId } = useAppRole()
  const { locations } = useLocations()
  const { batches, create, remove } = usePrepBatches(item.id)
  const unit = item.base_unit ?? 'kg'

  // Two inputs: per-label weight (grams) + number of labels to print. SALE
  // portions are fixed, so the weight auto-fills from portion_size below.
  const [grams, setGrams] = useState('')
  const [count, setCount] = useState('1')
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

  // SALE portions are fixed — auto-fill the per-label weight from portion_size.
  useEffect(() => {
    if (isSale && saleInfo?.portionSize != null) setGrams(String(saleInfo.portionSize))
  }, [isSale, saleInfo])

  const hasPortion = isSale && saleInfo?.portionSize != null && !!saleInfo.portionUnit
  const portionUnit = saleInfo?.portionUnit ?? 'g'

  const gramsNum = grams.trim() === '' ? null : Number(grams)
  const gramsValid = gramsNum != null && Number.isFinite(gramsNum) && gramsNum > 0
  const countNum = count.trim() === '' ? null : Number(count)
  const countValid = countNum != null && Number.isInteger(countNum) && countNum >= 1 && countNum <= 50
  const daysNum = days.trim() === '' ? null : Number(days)
  const daysValid = daysNum != null && Number.isInteger(daysNum) && daysNum > 0 && daysNum <= 365

  const useBy = daysValid ? addDays(new Date(), daysNum) : null
  const useByLabel = useBy ? shortDate(useBy) : '—'

  // What a batch row stores in its base_unit: a mass (kg) base keeps kilograms;
  // a pcs/portion base counts one portion per label.
  const batchWeight = unit === 'kg' && gramsNum != null ? gramsNum / 1000 : 1

  function formatGrams(g: number): string {
    return g >= 1000 ? `${(g / 1000).toFixed(g % 1000 === 0 ? 0 : 2)} kg` : `${Math.round(g)} g`
  }
  // Per-label weight string for a recorded batch: SALE = the fixed portion,
  // mass base = stored kg → g, otherwise the raw amount in its base unit.
  function weightLabelFor(b: PrepBatch): string {
    if (hasPortion && saleInfo?.portionSize != null) return formatGrams(saleInfo.portionSize)
    if (unit === 'kg') return formatGrams(b.weight * 1000)
    return `${b.weight} ${unit}`
  }

  // One label = one portion → per-portion КБЖУ (not scaled by count) + price.
  const saleNutrition = isSale ? saleNutritionFor(saleInfo, 1) : null
  const priceLabel = isSale && saleInfo?.price != null ? `฿${saleInfo.price}` : null
  const showSaleExtras =
    isSale && !!saleInfo && (saleNutrition != null || !!saleInfo.ingredients || priceLabel != null)

  const canPrint = gramsValid && countValid && daysValid && !!locationId && !printing

  async function printBatch(b: PrepBatch) {
    // SALE dishes get a consumer label: per-portion КБЖУ + состав + price. PF
    // preps print the plain storage label (extras stay undefined).
    const nutrition = saleNutrition
    const ingredients = isSale ? saleInfo?.ingredients ?? null : null

    // Bluetooth fallback: RawBT can only rasterize a PNG (ESC/POS) — may drift.
    if (transport === 'bluetooth') {
      printPrepLabel(
        {
          name: item.name,
          productCode: item.product_code,
          prepDate: new Date(b.produced_at),
          shelfLifeDays: shelfDaysOf(b),
          weight: weightLabelFor(b),
          qr: b.barcode,
          batchCode: b.batch_code ?? b.barcode,
          nutrition,
          ingredients,
          price: priceLabel,
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
          weight: weightLabelFor(b),
          qr: b.barcode,
          batchCode: b.batch_code ?? b.barcode,
          nutrition,
          ingredients,
          price: priceLabel,
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

  // Make `count` batches in one run — each its own row + unique code/QR — and
  // optionally print each. `count` > 1 adds a "-N" suffix so codes stay unique.
  async function runBatches(print: boolean) {
    if (!canPrint || daysNum == null || countNum == null) return
    setPrinting(true)
    setActionError(null)
    const multi = countNum > 1
    for (let i = 1; i <= countNum; i++) {
      const res = await create({
        nomenclatureId: item.id,
        productCode: item.product_code,
        weight: batchWeight,
        shelfLifeDays: daysNum,
        locationId,
        producedBy: staffId,
        seq: multi ? i : undefined,
      })
      if (!res.ok || !res.batch) {
        setPrinting(false)
        setActionError(res.error ?? 'Could not record batch')
        return
      }
      if (print) await printBatch(res.batch)
    }
    setPrinting(false)
  }

  const handlePrint = () => runBatches(true)
  const handleAddBatch = () => runBatches(false)

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
        <ChevronLeft className="h-4 w-4" /> All items
      </button>

      <div className="mb-5">
        <h1 className="text-lg font-semibold text-slate-100">{item.name}</h1>
        <p className="text-xs text-slate-500">{item.product_code}</p>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-4">
        {/* Per-label weight — SALE auto-fills from portion size (one per label) */}
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wider text-slate-400">
            Weight per label
          </span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="1"
              value={grams}
              onChange={(e) => setGrams(e.target.value)}
              readOnly={hasPortion}
              placeholder="e.g. 100"
              className={`w-full rounded-xl border px-3 py-3 text-lg outline-none ${
                hasPortion
                  ? 'border-slate-800 bg-slate-900 text-slate-300'
                  : 'border-slate-700 bg-slate-950 text-slate-100 focus:border-amber-500/60'
              }`}
            />
            <span className="whitespace-nowrap text-base text-slate-400">{hasPortion ? portionUnit : 'g'}</span>
          </div>
          {hasPortion && (
            <span className="mt-1 block text-[11px] text-slate-500">
              Auto from portion size — one portion per label
            </span>
          )}
        </label>

        {/* How many labels to print (each is its own batch + QR) */}
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wider text-slate-400">
            Labels to print
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={50}
            step="1"
            value={count}
            onChange={(e) => setCount(e.target.value)}
            placeholder="1"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-lg text-slate-100 outline-none focus:border-amber-500/60"
          />
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

        {/* SALE consumer-label preview: price + per-portion КБЖУ + состав */}
        {showSaleExtras && saleInfo && (
          <div className="space-y-1.5 rounded-xl border border-emerald-800/40 bg-emerald-950/20 px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-300/80">
                Sale label also prints
              </p>
              {priceLabel && <p className="text-base font-semibold text-slate-100">{priceLabel}</p>}
            </div>
            {saleNutrition ? (
              <p className="text-sm text-slate-200">
                {Math.round(saleNutrition.kcal)} kcal · P{Math.round(saleNutrition.protein)} · F
                {Math.round(saleNutrition.fat)} · C{Math.round(saleNutrition.carbs)}
                {hasPortion && saleInfo.portionSize != null && (
                  <span className="ml-1.5 text-[11px] text-slate-500">
                    per portion ({formatGrams(saleInfo.portionSize)})
                  </span>
                )}
              </p>
            ) : (
              <p className="text-xs text-amber-400/80">No КБЖУ set on this dish.</p>
            )}
            {saleInfo.ingredients ? (
              <p className="text-xs leading-relaxed text-slate-400">{saleInfo.ingredients}</p>
            ) : (
              <p className="text-xs text-amber-400/80">No composition set — add it on the dish card.</p>
            )}
          </div>
        )}

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
          {countValid && countNum != null && countNum > 1
            ? `Print ${countNum} labels`
            : 'Print & record batch'}
        </button>

        <button
          type="button"
          onClick={handleAddBatch}
          disabled={!canPrint}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-600 py-3 text-sm font-medium text-slate-200 transition hover:border-amber-500/50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
          {countValid && countNum != null && countNum > 1
            ? `Add ${countNum} batches (no print)`
            : 'Add batch (no print)'}
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
