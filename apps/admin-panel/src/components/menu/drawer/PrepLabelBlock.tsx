import { useState } from 'react'
import { Printer, Check, Loader2 } from 'lucide-react'
import type { PfPackCardData } from '../../../hooks/usePfPackCard'
import { usePfPackCardSave } from '../../../hooks/usePfPackCardSave'
import { addDays, printPrepLabel } from '../../../lib/labelPrinting'

/** Minimal shape a PF item needs for the storage label (satisfied by MenuItem). */
export interface PrepLabelItem {
  id: string
  name: string
  product_code: string
  card_version: number
}

/**
 * Storage-label block for a PF (prep / semi-finished) item.
 * Lets the cook set a shelf life (persisted to pf_pack_card.shelf_life_days) and
 * print a 60×40 prep label (name + prep date + use-by) to the XP-420B via RawBT.
 */
export function PrepLabelBlock({ item, card }: { item: PrepLabelItem; card: PfPackCardData | null }) {
  const { save, saving } = usePfPackCardSave()

  const initialDays = card?.shelf_life_days ?? null
  const [value, setValue] = useState<string>(initialDays != null ? String(initialDays) : '')
  const [savedDays, setSavedDays] = useState<number | null>(initialDays)
  const [version, setVersion] = useState<number>(item.card_version)
  const [justSaved, setJustSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmed = value.trim()
  const parsed = trimmed === '' ? null : Number(trimmed)
  const isValid = parsed === null || (Number.isInteger(parsed) && parsed > 0 && parsed <= 365)
  const dirty = parsed !== savedDays && isValid

  const today = new Date()
  const useBy = parsed != null ? addDays(today, parsed) : null
  const useByLabel = useBy
    ? useBy.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : '—'

  async function handleSave() {
    if (!dirty) return
    setError(null)
    const res = await save(item.id, version, { shelf_life_days: parsed })
    if (!res.ok) {
      setError(
        res.error === 'version_conflict'
          ? 'Карточку кто-то изменил — обновите страницу'
          : 'Не удалось сохранить',
      )
      return
    }
    if (res.newVersion != null) setVersion(res.newVersion)
    setSavedDays(parsed)
    setJustSaved(true)
    setTimeout(() => setJustSaved(false), 1500)
  }

  function handlePrint() {
    printPrepLabel({
      name: item.name,
      productCode: item.product_code,
      prepDate: new Date(),
      shelfLifeDays: parsed,
    })
  }

  return (
    <section className="space-y-3">
      <h4 className="text-[10px] uppercase tracking-widest text-cream/50">🏷️ Storage Label</h4>

      <div className="space-y-3 rounded-xl border border-surface-3 bg-surface-2/60 px-4 py-3">
        {/* Shelf life editor */}
        <div className="flex items-end gap-3">
          <label className="flex-1">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-cream/45">
              Срок хранения (дней)
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              value={value}
              onChange={(e) => {
                setValue(e.target.value)
                setError(null)
              }}
              placeholder="напр. 3"
              className="w-full rounded-lg border border-surface-3 bg-surface-1 px-3 py-2 text-sm text-cream outline-none focus:border-amber-500/60"
            />
          </label>
          {dirty && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex h-[38px] items-center gap-1.5 rounded-lg bg-amber-500/90 px-3 text-xs font-semibold text-black hover:bg-amber-400 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Сохранить'}
            </button>
          )}
          {justSaved && !dirty && (
            <span className="flex h-[38px] items-center gap-1 text-xs text-emerald-400">
              <Check className="h-4 w-4" /> Сохранено
            </span>
          )}
        </div>

        {!isValid && (
          <p className="text-[11px] text-rose-400">Введите целое число от 1 до 365.</p>
        )}
        {error && <p className="text-[11px] text-rose-400">{error}</p>}

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
