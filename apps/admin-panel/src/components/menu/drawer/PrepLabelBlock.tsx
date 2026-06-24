import { useEffect, useState } from 'react'
import { Printer, Check, Loader2 } from 'lucide-react'
import { usePfPackCardSave } from '../../../hooks/usePfPackCardSave'
import type { PfPackCardData } from '../../../hooks/usePfPackCard'
import { addDays, printPrepLabel } from '../../../lib/labelPrinting'
import { isCountableUnit } from '../../../lib/packLabel'

/** Minimal shape a PF item needs for the storage label (satisfied by MenuItem). */
export interface PrepLabelItem {
  id: string
  name: string
  product_code: string
  /** base_unit — countable (pcs/portion) preps expose pack-size fields. */
  base_unit: string | null
  card_version: number
  /** Shelf life in days from nomenclature (single source of truth, mig 307). */
  shelf_life_days: number | null
}

/**
 * Storage-label block for a PF (prep / semi-finished) item.
 *
 * Lets the owner set the shelf life (persisted to nomenclature.shelf_life_days —
 * the single source of truth that also drives batch expiry) and, for countable
 * preps (pcs / portion), the per-piece weight + standard pack size on
 * pf_pack_card. Those feed the kitchen-label station so it can print
 * "8 pcs / 480 g" straight from the DB. Also prints a quick 60×40 shelf-life
 * label (name + prep date + use-by) to the XP-420B via RawBT.
 */
export function PrepLabelBlock({
  item,
  packCard,
}: {
  item: PrepLabelItem
  packCard?: PfPackCardData | null
}) {
  const { save, saving } = usePfPackCardSave()
  const countable = isCountableUnit(item.base_unit)

  const [version, setVersion] = useState<number>(item.card_version)
  const [justSaved, setJustSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Each field keeps its own saved value so one Save sends only what changed.
  const [days, setDays] = useState<string>(
    item.shelf_life_days != null ? String(item.shelf_life_days) : '',
  )
  const [savedDays, setSavedDays] = useState<number | null>(item.shelf_life_days ?? null)

  const [gpp, setGpp] = useState<string>('')
  const [savedGpp, setSavedGpp] = useState<number | null>(null)
  const [perBag, setPerBag] = useState<string>('')
  const [savedPerBag, setSavedPerBag] = useState<number | null>(null)

  // pf_pack_card loads async (one fetch per drawer open) — sync the pack-size
  // fields in once it arrives.
  useEffect(() => {
    const g = packCard?.portion_weight_g ?? null
    const b = packCard?.portions_per_bag ?? null
    setGpp(g != null ? String(g) : '')
    setSavedGpp(g)
    setPerBag(b != null ? String(b) : '')
    setSavedPerBag(b)
  }, [packCard])

  const parse = (s: string): number | null => (s.trim() === '' ? null : Number(s))
  const daysVal = parse(days)
  const daysValid = daysVal === null || (Number.isInteger(daysVal) && daysVal > 0 && daysVal <= 365)
  const gppVal = parse(gpp)
  const gppValid = gppVal === null || (Number.isFinite(gppVal) && gppVal > 0 && gppVal <= 100000)
  const perBagVal = parse(perBag)
  const perBagValid =
    perBagVal === null || (Number.isInteger(perBagVal) && perBagVal >= 1 && perBagVal <= 999)

  const daysDirty = daysVal !== savedDays && daysValid
  const gppDirty = countable && gppVal !== savedGpp && gppValid
  const perBagDirty = countable && perBagVal !== savedPerBag && perBagValid
  const dirty = daysDirty || gppDirty || perBagDirty
  const allValid = daysValid && gppValid && perBagValid

  const today = new Date()
  const useBy = daysVal != null ? addDays(today, daysVal) : null
  const useByLabel = useBy
    ? useBy.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : '—'

  async function handleSave() {
    if (!dirty) return
    setError(null)
    const patch: Record<string, unknown> = {}
    if (daysDirty) patch.shelf_life_days = daysVal
    if (gppDirty) patch.portion_weight_g = gppVal
    if (perBagDirty) patch.portions_per_bag = perBagVal
    const res = await save(item.id, version, patch)
    if (!res.ok) {
      setError(
        res.error === 'version_conflict'
          ? 'Карточку кто-то изменил — обновите страницу'
          : 'Не удалось сохранить',
      )
      return
    }
    if (res.newVersion != null) setVersion(res.newVersion)
    setSavedDays(daysVal)
    setSavedGpp(gppVal)
    setSavedPerBag(perBagVal)
    setJustSaved(true)
    setTimeout(() => setJustSaved(false), 1500)
  }

  function handlePrint() {
    printPrepLabel({
      name: item.name,
      productCode: item.product_code,
      prepDate: new Date(),
      shelfLifeDays: daysVal,
    })
  }

  const inputClass =
    'w-full rounded-lg border border-surface-3 bg-surface-1 px-3 py-2 text-sm text-cream outline-none focus:border-amber-500/60'

  return (
    <section className="space-y-3">
      <h4 className="text-[10px] uppercase tracking-widest text-cream/50">🏷️ Storage Label</h4>

      <div className="space-y-3 rounded-xl border border-surface-3 bg-surface-2/60 px-4 py-3">
        {/* Shelf life */}
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-cream/45">
            Срок хранения (дней)
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={365}
            value={days}
            onChange={(e) => {
              setDays(e.target.value)
              setError(null)
            }}
            placeholder="напр. 3"
            className={inputClass}
          />
        </label>

        {/* Pack size — countable preps only (drives "8 pcs / 480 g" labels) */}
        {countable && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wider text-cream/45">
                Вес 1 шт (г)
              </span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="1"
                value={gpp}
                onChange={(e) => {
                  setGpp(e.target.value)
                  setError(null)
                }}
                placeholder="напр. 60"
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wider text-cream/45">
                Шт в упаковке
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={999}
                step="1"
                value={perBag}
                onChange={(e) => {
                  setPerBag(e.target.value)
                  setError(null)
                }}
                placeholder="напр. 8"
                className={inputClass}
              />
            </label>
          </div>
        )}

        {!allValid && (
          <p className="text-[11px] text-rose-400">
            Срок — целое 1–365; вес 1 шт &gt; 0; штук в упаковке — целое 1–999.
          </p>
        )}
        {error && <p className="text-[11px] text-rose-400">{error}</p>}

        {/* Save (only when something changed) */}
        {dirty && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-500/90 px-3 py-2 text-xs font-semibold text-black hover:bg-amber-400 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Сохранить'}
          </button>
        )}
        {justSaved && !dirty && (
          <span className="flex items-center justify-center gap-1 text-xs text-emerald-400">
            <Check className="h-4 w-4" /> Сохранено
          </span>
        )}

        {/* Use-by preview */}
        <div className="flex items-center justify-between rounded-lg bg-surface-1/60 px-3 py-2 text-xs">
          <span className="text-cream/45">Годен до (от сегодня)</span>
          <span className="font-semibold text-cream">{useByLabel}</span>
        </div>

        {/* Print */}
        <button
          type="button"
          onClick={handlePrint}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 py-2.5 text-sm font-semibold text-amber-300 hover:bg-amber-500/20"
        >
          <Printer className="h-4 w-4" /> Печать этикетки
        </button>
        <p className="text-center text-[10px] text-cream/35">
          Печатает на планшете через RawBT → XP-420B (60×40 мм)
        </p>
      </div>
    </section>
  )
}
