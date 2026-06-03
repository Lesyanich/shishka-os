import { useState } from 'react'
import { ChevronDown, Link2, Link2Off, Check, X, Pencil } from 'lucide-react'
import type {
  LoyverseModifierListRow,
  LoyverseModifierOptionRow,
} from '../../../hooks/useLoyverseModifierPull'
import {
  useModifierOptionCosts,
  type ModOption,
  type OptionCostLink,
} from '../../../hooks/useModifierOptionCosts'

interface Props {
  lists: LoyverseModifierListRow[]
  options: LoyverseModifierOptionRow[]
}

function money(n: number | null | undefined): string {
  if (n == null) return '—'
  return `฿${Number(n).toFixed(0)}`
}

// One option row: price (Loyverse, read-only) + the option→MOD food-cost link editor.
// Writes go to modifier_option_cost only (no Loyverse side-effects — that is Phase 5).
function OptionRow({
  option,
  link,
  mods,
  onSave,
  onUnlink,
}: {
  option: LoyverseModifierOptionRow
  link: OptionCostLink | undefined
  mods: ModOption[]
  onSave: (optionId: string, modifierId: string, qty: number) => Promise<{ ok: boolean; error?: string }>
  onUnlink: (optionId: string) => Promise<{ ok: boolean; error?: string }>
}) {
  const [editing, setEditing] = useState(false)
  const [modifierId, setModifierId] = useState(link?.modifier_id ?? '')
  const [qty, setQty] = useState<string>(link ? String(link.quantity_per_unit) : '1')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const cost = link?.modifier_cost_per_unit != null ? link.modifier_cost_per_unit * link.quantity_per_unit : null
  const margin = cost != null && option.price != null ? option.price - cost : null

  const startEdit = () => {
    setModifierId(link?.modifier_id ?? '')
    setQty(link ? String(link.quantity_per_unit) : '1')
    setErr(null)
    setEditing(true)
  }

  const save = async () => {
    const q = Number(qty)
    if (!modifierId) { setErr('pick a MOD'); return }
    if (!Number.isFinite(q) || q <= 0) { setErr('qty > 0'); return }
    setBusy(true)
    const res = await onSave(option.id, modifierId, q)
    setBusy(false)
    if (!res.ok) { setErr(res.error ?? 'save failed'); return }
    setEditing(false)
  }

  const unlink = async () => {
    setBusy(true)
    const res = await onUnlink(option.id)
    setBusy(false)
    if (!res.ok) setErr(res.error ?? 'unlink failed')
  }

  return (
    <li className="flex flex-col gap-1 py-1.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-slate-300">{option.name}</span>
        <span className="flex items-center gap-3">
          <span className="text-slate-500" title="Loyverse price">{money(option.price)}</span>
          {!editing && (
            link ? (
              <button
                type="button"
                onClick={startEdit}
                className="inline-flex items-center gap-1 rounded bg-sky-500/10 px-1.5 py-0.5 text-sky-300 hover:bg-sky-500/20"
              >
                <Pencil className="h-3 w-3" /> {link.modifier_code}
              </button>
            ) : (
              <button
                type="button"
                onClick={startEdit}
                className="inline-flex items-center gap-1 rounded bg-slate-700/40 px-1.5 py-0.5 text-slate-300 hover:bg-slate-700/70"
              >
                <Link2 className="h-3 w-3" /> Link cost
              </button>
            )
          )}
        </span>
      </div>

      {/* Linked summary (cost + margin) when not editing */}
      {!editing && link && (
        <div className="flex items-center gap-3 pl-1 text-[11px] text-slate-500">
          <span>{link.quantity_per_unit}× {link.modifier_name}</span>
          <span title="cost = MOD cost × qty">cost {money(cost)}</span>
          <span
            className={margin != null && margin < 0 ? 'text-rose-400' : 'text-emerald-400'}
            title="margin = price − cost"
          >
            margin {money(margin)}
          </span>
        </div>
      )}

      {/* Editor */}
      {editing && (
        <div className="flex flex-wrap items-center gap-2 rounded bg-slate-950/60 p-2">
          <select
            value={modifierId}
            onChange={(e) => setModifierId(e.target.value)}
            className="rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-slate-200"
          >
            <option value="">— pick MOD —</option>
            {mods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.product_code} ({money(m.cost_per_unit)}/unit)
              </option>
            ))}
          </select>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="w-20 rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-slate-200"
            placeholder="qty"
          />
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-1 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
          >
            <Check className="h-3 w-3" /> Save
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="inline-flex items-center gap-1 rounded bg-slate-700/40 px-2 py-1 text-slate-300 hover:bg-slate-700/70"
          >
            <X className="h-3 w-3" /> Cancel
          </button>
          {link && (
            <button
              type="button"
              onClick={unlink}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded bg-rose-500/10 px-2 py-1 text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
            >
              <Link2Off className="h-3 w-3" /> Unlink
            </button>
          )}
          {err && <span className="text-rose-400">{err}</span>}
        </div>
      )}
    </li>
  )
}

// 2-level editor: GROUPS (Loyverse modifier lists) → OPTIONS, with the option→MOD
// food-cost link editor inline. This is the Phase 3 deliverable for MC 38911fde.
export function GroupOptionEditor({ lists, options }: Props) {
  const { costByOptionId, mods, error, upsert, remove } = useModifierOptionCosts()
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (lists.length === 0) {
    return (
      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-500">
        No Loyverse modifier groups pulled yet. Click &quot;Pull now&quot; above.
      </section>
    )
  }

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/40">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-200">Groups → options (cost editor)</h2>
        <span className="text-xs text-slate-500">price = Loyverse · cost/margin = ours</span>
      </header>
      {error && (
        <div className="border-b border-slate-800 px-4 py-2 text-xs text-rose-400">{error}</div>
      )}
      <ul className="divide-y divide-slate-800">
        {lists.map((l) => {
          const isOpen = openIds.has(l.id)
          const listOpts = options.filter((o) => o.list_id === l.id)
          const linkedCount = listOpts.filter((o) => costByOptionId[o.id]).length
          return (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => toggle(l.id)}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-slate-900"
              >
                <span className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-200">{l.name}</span>
                  <span className="text-xs text-slate-500">
                    (min:{l.min_select ?? '–'} max:{l.max_select ?? '–'}) — {listOpts.length} options · {linkedCount} costed
                  </span>
                </span>
                <ChevronDown
                  className={['h-3.5 w-3.5 text-slate-500 transition-transform', isOpen ? '' : '-rotate-90'].join(' ')}
                />
              </button>
              {isOpen && (
                <ul className="border-t border-slate-800 bg-slate-950/40 px-4 py-1 divide-y divide-slate-900">
                  {listOpts.length === 0 ? (
                    <li className="py-1 text-xs text-slate-600">(no options)</li>
                  ) : (
                    listOpts.map((o) => (
                      <OptionRow
                        key={o.id}
                        option={o}
                        link={costByOptionId[o.id]}
                        mods={mods}
                        onSave={upsert}
                        onUnlink={remove}
                      />
                    ))
                  )}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
