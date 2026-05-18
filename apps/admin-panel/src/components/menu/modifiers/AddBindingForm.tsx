import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import type {
  LoyverseModifierListRow,
  LoyverseModifierOptionRow,
} from '../../../hooks/useLoyverseModifierPull'
import type { BindingPatch, SlotName } from '../../../hooks/useModifierBindings'

const SLOT_VALUES: SlotName[] = ['base', 'protein', 'greens', 'topping', 'sauce']

interface NomLite { id: string; product_code: string; name: string }

interface Props {
  loyverseOptions: LoyverseModifierOptionRow[]
  loyverseLists: LoyverseModifierListRow[]
  onSubmit: (patch: BindingPatch) => Promise<{ ok: boolean; error?: string }>
  onCancel: () => void
}

export function AddBindingForm({ loyverseOptions, loyverseLists, onSubmit, onCancel }: Props) {
  const [dishes, setDishes] = useState<NomLite[]>([])
  const [mods, setMods] = useState<NomLite[]>([])
  const [dishId, setDishId] = useState<string>('')
  const [modifierId, setModifierId] = useState<string>('')
  const [loyverseOptionId, setLoyverseOptionId] = useState<string>('')
  const [slot, setSlot] = useState<SlotName | ''>('')
  const [qty, setQty] = useState<string>('1')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all([
      supabase.from('nomenclature').select('id, product_code, name').like('product_code', 'SALE-%').order('product_code'),
      supabase.from('nomenclature').select('id, product_code, name').like('product_code', 'MOD-%').order('product_code'),
    ]).then(([s, m]) => {
      if (!alive) return
      setDishes((s.data ?? []) as NomLite[])
      setMods((m.data ?? []) as NomLite[])
    })
    return () => { alive = false }
  }, [])

  // Auto-fill slot from Loyverse list name when an option is picked.
  useEffect(() => {
    if (!loyverseOptionId) return
    const opt = loyverseOptions.find((o) => o.id === loyverseOptionId)
    if (!opt) return
    const list = loyverseLists.find((l) => l.id === opt.list_id)
    if (!list) return
    const guess = list.name.toLowerCase() as SlotName
    if (SLOT_VALUES.includes(guess)) setSlot(guess)
  }, [loyverseOptionId, loyverseOptions, loyverseLists])

  const loyverseListLookup = useMemo(() => {
    return new Map(loyverseLists.map((l) => [l.id, l]))
  }, [loyverseLists])

  const valid =
    dishId && modifierId && slot && Number(qty) > 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid) return
    setSubmitting(true)
    setError(null)
    const opt = loyverseOptions.find((o) => o.id === loyverseOptionId)
    const list = opt ? loyverseListLookup.get(opt.list_id) : undefined
    const patch: BindingPatch = {
      dish_id: dishId,
      modifier_id: modifierId,
      slot: slot as SlotName,
      quantity_per_unit: Number(qty),
      loyverse_modifier_id: opt?.id ?? null,
      loyverse_modifier_list_id: list?.id ?? null,
      loyverse_modifier_list_name: list?.name ?? null,
    }
    const res = await onSubmit(patch)
    setSubmitting(false)
    if (!res.ok) setError(res.error ?? 'save failed')
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 rounded-lg border border-slate-800 bg-slate-950 p-4 text-xs">
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-slate-500">Dish (SALE-*)</span>
          <select
            value={dishId}
            onChange={(e) => setDishId(e.target.value)}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200"
          >
            <option value="">— pick dish —</option>
            {dishes.map((d) => (<option key={d.id} value={d.id}>{d.product_code} · {d.name}</option>))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-slate-500">Loyverse option (optional)</span>
          <select
            value={loyverseOptionId}
            onChange={(e) => setLoyverseOptionId(e.target.value)}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200"
          >
            <option value="">— pick pulled option —</option>
            {loyverseOptions.map((o) => {
              const l = loyverseListLookup.get(o.list_id)
              return (
                <option key={o.id} value={o.id}>
                  {l ? `${l.name} · ${o.name}` : o.name}
                </option>
              )
            })}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-slate-500">Slot</span>
          <select
            value={slot}
            onChange={(e) => setSlot(e.target.value as SlotName | '')}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200"
          >
            <option value="">— pick slot —</option>
            {SLOT_VALUES.map((s) => (<option key={s} value={s}>{s}</option>))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-slate-500">MOD nomenclature</span>
          <select
            value={modifierId}
            onChange={(e) => setModifierId(e.target.value)}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200"
          >
            <option value="">— pick MOD —</option>
            {mods.map((m) => (<option key={m.id} value={m.id}>{m.product_code} · {m.name}</option>))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-slate-500">Quantity per unit</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 tabular-nums text-slate-200"
          />
        </label>
      </div>

      {error && <p className="text-rose-400">{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-3 py-1.5 text-slate-400 hover:text-slate-200"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!valid || submitting}
          className="rounded bg-emerald-500/15 px-3 py-1.5 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save binding'}
        </button>
      </div>
    </form>
  )
}
