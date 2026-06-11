import { useState } from 'react'
import { Plus } from 'lucide-react'
import {
  SHOPPING_STORES,
  STORE_LABELS,
  type NewShoppingItem,
  type ShoppingStore,
} from '../../types/shopping'

interface AddItemRowProps {
  onAdd: (item: NewShoppingItem) => Promise<{ ok: boolean; error?: string }>
}

const EMPTY: NewShoppingItem = {
  name: '',
  store: 'makro',
  product_url: '',
  qty: 1,
  unit: '',
  est_price: null,
  notes: '',
}

export function AddItemRow({ onAdd }: AddItemRowProps) {
  const [draft, setDraft] = useState<NewShoppingItem>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    if (!draft.name.trim()) {
      setErr('Name is required')
      return
    }
    setSaving(true)
    setErr(null)
    const res = await onAdd({
      ...draft,
      name: draft.name.trim(),
      product_url: draft.product_url?.trim() || null,
      unit: draft.unit?.trim() || null,
    })
    setSaving(false)
    if (!res.ok) {
      setErr(res.error ?? 'Failed to add')
      return
    }
    setDraft(EMPTY)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') submit()
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-500">Item</span>
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            onKeyDown={onKeyDown}
            placeholder="Product name"
            className="w-52 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-500">Store</span>
          <select
            value={draft.store}
            onChange={(e) => setDraft({ ...draft, store: e.target.value as ShoppingStore })}
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
          >
            {SHOPPING_STORES.map((s) => (
              <option key={s} value={s}>
                {STORE_LABELS[s]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-500">Link</span>
          <input
            value={draft.product_url ?? ''}
            onChange={(e) => setDraft({ ...draft, product_url: e.target.value })}
            onKeyDown={onKeyDown}
            placeholder="https://…"
            className="w-56 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-500">Qty</span>
          <input
            type="number"
            value={draft.qty ?? ''}
            onChange={(e) => setDraft({ ...draft, qty: e.target.value === '' ? null : Number(e.target.value) })}
            onKeyDown={onKeyDown}
            className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs tabular-nums text-slate-100 focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-500">Unit</span>
          <input
            value={draft.unit ?? ''}
            onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
            onKeyDown={onKeyDown}
            placeholder="kg"
            className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-500">฿ Price</span>
          <input
            type="number"
            value={draft.est_price ?? ''}
            onChange={(e) => setDraft({ ...draft, est_price: e.target.value === '' ? null : Number(e.target.value) })}
            onKeyDown={onKeyDown}
            placeholder="0"
            className="w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs tabular-nums text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <button
          onClick={submit}
          disabled={saving}
          className="flex items-center gap-1 rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      </div>
      {err && <p className="mt-2 text-[11px] text-rose-400">{err}</p>}
    </div>
  )
}
