import { useState } from 'react'
import { ChevronRight, X, Plus, Search, Check, Pencil, Link2 } from 'lucide-react'
import type {
  LoyverseModifierListRow,
  LoyverseModifierOptionRow,
} from '../../../hooks/useLoyverseModifierPull'
import type { DishRow } from '../../../hooks/useDishModifierGroups'
import {
  useModifierOptionEditing,
  type ModOption,
  type OptionCostLink,
} from '../../../hooks/useModifierOptionEditing'
import { useModifierListOps } from '../../../hooks/useModifierListOps'

interface Props {
  lists: LoyverseModifierListRow[]
  options: LoyverseModifierOptionRow[]
  dishes: DishRow[]
  attachmentsByDish: Record<string, string[]>
  attach: (dishId: string, listId: string) => Promise<{ ok: boolean; error?: string }>
  detach: (dishId: string, listId: string) => Promise<{ ok: boolean; error?: string }>
  /** Called after add/remove option (Loyverse mutated) so the page can refresh. */
  onChanged?: () => void
}

function money(n: number | null | undefined): string {
  if (n == null) return '—'
  return `฿${Number(n).toFixed(0)}`
}

// Per-option editor inside a group: staged selling price (-> modifier_option_overrides,
// pushed to Loyverse in Phase 5) + cost link (option -> MOD-* + portion ->
// modifier_option_cost, immediate, ours). Shows computed cost + margin.
function OptionEditRow({
  option,
  mirrorPrice,
  override,
  cost,
  mods,
  onSetPrice,
  onClearPrice,
  onSaveCost,
  onRemoveCost,
  onRemoveOption,
  removing,
}: {
  option: LoyverseModifierOptionRow
  mirrorPrice: number | null
  override: number | undefined
  cost: OptionCostLink | undefined
  mods: ModOption[]
  onSetPrice: (optionId: string, price: number) => Promise<{ ok: boolean; error?: string }>
  onClearPrice: (optionId: string) => Promise<{ ok: boolean; error?: string }>
  onSaveCost: (optionId: string, modifierId: string, qty: number) => Promise<{ ok: boolean; error?: string }>
  onRemoveCost: (optionId: string) => Promise<{ ok: boolean; error?: string }>
  onRemoveOption: () => void
  removing: boolean
}) {
  const effectivePrice = override ?? mirrorPrice ?? 0
  const [priceDraft, setPriceDraft] = useState<string>(String(effectivePrice))
  const [editingCost, setEditingCost] = useState(false)
  const [modifierId, setModifierId] = useState(cost?.modifier_id ?? '')
  const [qty, setQty] = useState<string>(cost ? String(cost.quantity_per_unit) : '1')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const needsPush = override != null && override !== (mirrorPrice ?? null)
  const costValue = cost?.modifier_cost_per_unit != null ? cost.modifier_cost_per_unit * cost.quantity_per_unit : null
  const margin = costValue != null ? effectivePrice - costValue : null
  // Live cost preview while editing weight/ingredient (before saving the link).
  const draftMod = mods.find((m) => m.id === modifierId)
  const liveCost =
    draftMod?.cost_per_unit != null && Number.isFinite(Number(qty)) ? draftMod.cost_per_unit * Number(qty) : null
  const liveMargin = liveCost != null ? effectivePrice - liveCost : null
  const editUnit = draftMod?.base_unit?.trim() || 'unit'
  const costUnit = cost?.modifier_base_unit?.trim() || 'unit'

  const savePrice = async () => {
    const v = Number(priceDraft)
    if (!Number.isFinite(v)) { setPriceDraft(String(effectivePrice)); return }
    setErr(null)
    // If the draft equals the live Loyverse price, drop the override (nothing to push).
    const res = v === (mirrorPrice ?? null) ? await onClearPrice(option.id) : await onSetPrice(option.id, v)
    if (!res.ok) setErr(res.error ?? 'price save failed')
  }

  const saveCost = async () => {
    const q = Number(qty)
    if (!modifierId) { setErr('pick an ingredient'); return }
    if (!Number.isFinite(q) || q <= 0) { setErr('qty > 0'); return }
    setBusy(true); setErr(null)
    const res = await onSaveCost(option.id, modifierId, q)
    setBusy(false)
    if (!res.ok) { setErr(res.error ?? 'cost save failed'); return }
    setEditingCost(false)
  }

  return (
    <li className="py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-200">{option.name}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-500">฿</span>
          <input
            type="number"
            value={priceDraft}
            onChange={(e) => setPriceDraft(e.target.value)}
            onBlur={savePrice}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            className="w-16 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-right text-xs text-slate-200"
          />
          {needsPush && (
            <span
              className="rounded bg-amber-500/15 px-1 py-0.5 text-[10px] text-amber-300"
              title={`Loyverse has ฿${mirrorPrice ?? 0} — needs push`}
            >
              draft
            </span>
          )}
          <button
            type="button"
            onClick={onRemoveOption}
            disabled={removing}
            title="Remove this option from the group (Loyverse)"
            className="ml-1 rounded p-0.5 text-slate-500 hover:bg-rose-500/15 hover:text-rose-300 disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* cost line */}
      {!editingCost ? (
        <div className="mt-1 flex items-center gap-2 pl-1 text-[11px] text-slate-500">
          {cost ? (
            <>
              <span>{cost.quantity_per_unit} {costUnit} × {cost.modifier_code}</span>
              <span title="cost = ingredient cost × weight">cost {money(costValue)}</span>
              <span className={margin != null && margin < 0 ? 'text-rose-400' : 'text-emerald-400'} title="margin = price − cost">
                margin {money(margin)}
              </span>
              <button type="button" onClick={() => setEditingCost(true)} className="inline-flex items-center gap-0.5 text-sky-300 hover:text-sky-200">
                <Pencil className="h-2.5 w-2.5" /> edit
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setEditingCost(true)} className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-200">
              <Link2 className="h-3 w-3" /> link cost (ingredient)
            </button>
          )}
        </div>
      ) : (
        <div className="mt-1 flex flex-wrap items-center gap-2 rounded bg-slate-950/60 p-2">
          <select
            value={modifierId}
            onChange={(e) => setModifierId(e.target.value)}
            className="rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-xs text-slate-200"
          >
            <option value="">— ingredient (MOD) —</option>
            {mods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.product_code} ({money(m.cost_per_unit)}/{m.base_unit?.trim() || 'unit'})
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-[11px] text-slate-400">
            weight
            <input
              type="number" min="0" step="any" value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="0"
              className="w-20 rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-right text-xs text-slate-200"
            />
            <span className="text-slate-500">{editUnit}</span>
          </label>
          {/* Live cost from weight × ingredient unit cost */}
          <span className="text-[11px] text-slate-400">
            = cost {money(liveCost)} ·{' '}
            <span className={liveMargin != null && liveMargin < 0 ? 'text-rose-400' : 'text-emerald-400'}>
              margin {money(liveMargin)}
            </span>
          </span>
          <button type="button" onClick={saveCost} disabled={busy} className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50">
            <Check className="h-3 w-3" /> Save
          </button>
          <button type="button" onClick={() => setEditingCost(false)} className="inline-flex items-center gap-1 rounded bg-slate-700/40 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700/70">
            <X className="h-3 w-3" /> Cancel
          </button>
          {cost && (
            <button type="button" onClick={() => run2(setBusy, setErr, onRemoveCost(option.id), () => setEditingCost(false))} disabled={busy} className="inline-flex items-center gap-1 rounded bg-rose-500/10 px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/20 disabled:opacity-50">
              Unlink
            </button>
          )}
        </div>
      )}
      {err && <p className="pl-1 pt-1 text-[11px] text-rose-400">{err}</p>}
    </li>
  )
}

// Small helper for the unlink action (keeps the JSX above terse).
async function run2(
  setBusy: (b: boolean) => void,
  setErr: (e: string | null) => void,
  p: Promise<{ ok: boolean; error?: string }>,
  done: () => void,
) {
  setBusy(true); setErr(null)
  const res = await p
  setBusy(false)
  if (!res.ok) setErr(res.error ?? 'failed')
  else done()
}

// Phase 3 (redesign, MC 38911fde): "by group" master-detail, Loyverse-style.
// Left: list of modifier groups. Right (selected group): its options (read-only,
// like Loyverse) + the summary of which dishes it is attached to, with add/remove.
export function ModifierGroupsTab({ lists, options, dishes, attachmentsByDish, attach, detach, onChanged }: Props) {
  const { costByOptionId, priceByOptionId, mods, upsertCost, removeCost, setPrice, clearPrice } =
    useModifierOptionEditing()
  const { addOption, removeOption, isBusy: opBusy } = useModifierListOps()
  const [selId, setSelId] = useState<string | null>(lists[0]?.id ?? null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [newOptName, setNewOptName] = useState('')
  const [newOptPrice, setNewOptPrice] = useState('0')

  const sel = lists.find((l) => l.id === selId) ?? null
  const dishesForGroup = (listId: string) =>
    dishes.filter((d) => (attachmentsByDish[d.id] ?? []).includes(listId))

  // Add/remove an option mutates Loyverse (the edge fn re-attaches dishes after);
  // refresh pull + attachments via onChanged when done.
  const doAddOption = async () => {
    if (!sel || !newOptName.trim()) return
    setErr(null)
    const res = await addOption(sel.id, newOptName.trim(), Number(newOptPrice) || 0)
    if (!res.ok) { setErr(res.error ?? 'add failed'); return }
    setNewOptName(''); setNewOptPrice('0')
    onChanged?.()
  }
  const doRemoveOption = async (optionName: string) => {
    if (!sel) return
    if (!window.confirm(`Remove "${optionName}" from "${sel.name}" in Loyverse?`)) return
    setErr(null)
    const res = await removeOption(sel.id, optionName)
    if (!res.ok) { setErr(res.error ?? 'remove failed'); return }
    onChanged?.()
  }

  const run = async (p: Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true)
    setErr(null)
    const res = await p
    setBusy(false)
    if (!res.ok) setErr(res.error ?? 'failed')
  }

  if (lists.length === 0) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-500">
        No modifier groups pulled yet. Click &quot;Pull now&quot; above.
      </div>
    )
  }

  const selOptions = sel ? options.filter((o) => o.list_id === sel.id) : []
  const selDishes = sel ? dishesForGroup(sel.id) : []
  const attachedIds = new Set(selDishes.map((d) => d.id))
  const unattachedDishes = dishes.filter((d) => !attachedIds.has(d.id))
  const q = query.trim().toLowerCase()
  const matches = q
    ? unattachedDishes
        .filter(
          (d) =>
            d.name.toLowerCase().includes(q) ||
            d.product_code.toLowerCase().includes(q) ||
            (d.category ?? '').toLowerCase().includes(q),
        )
        .slice(0, 50)
    : []

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[260px_1fr]">
      {/* Master: group list */}
      <ul className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/40">
        {lists.map((l) => {
          const isSel = l.id === selId
          const dishCount = dishesForGroup(l.id).length
          const optCount = options.filter((o) => o.list_id === l.id).length
          return (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => { setSelId(l.id); setErr(null); setQuery('') }}
                className={[
                  'flex w-full items-center justify-between border-b border-slate-800/70 px-3 py-2.5 text-left',
                  isSel ? 'bg-emerald-500/10' : 'hover:bg-slate-900',
                ].join(' ')}
              >
                <span>
                  <span className={isSel ? 'text-sm font-medium text-emerald-200' : 'text-sm text-slate-200'}>
                    {l.name}
                  </span>
                  <span className="block text-[11px] text-slate-500">
                    {optCount} options · {dishCount} dishes
                  </span>
                </span>
                <ChevronRight className={['h-3.5 w-3.5', isSel ? 'text-emerald-300' : 'text-slate-600'].join(' ')} />
              </button>
            </li>
          )
        })}
      </ul>

      {/* Detail: selected group */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/40">
        {!sel ? (
          <div className="p-6 text-sm text-slate-500">Pick a group on the left.</div>
        ) : (
          <div className="divide-y divide-slate-800">
            <header className="px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-100">{sel.name}</h3>
              <p className="text-[11px] text-slate-500">
                min:{sel.min_select ?? '–'} max:{sel.max_select ?? '–'}
              </p>
            </header>

            {/* Options — editable price (staged) + cost link */}
            <section className="px-4 py-3">
              <div className="flex items-center justify-between pb-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Options</h4>
                <span className="text-[10px] text-slate-600">price → Loyverse on push · cost = ours</span>
              </div>
              {selOptions.length === 0 ? (
                <p className="text-xs text-slate-600">(no options)</p>
              ) : (
                <ul className="divide-y divide-slate-800/60">
                  {selOptions.map((o) => (
                    <OptionEditRow
                      key={o.id}
                      option={o}
                      mirrorPrice={o.price}
                      override={priceByOptionId[o.id]}
                      cost={costByOptionId[o.id]}
                      mods={mods}
                      onSetPrice={setPrice}
                      onClearPrice={clearPrice}
                      onSaveCost={upsertCost}
                      onRemoveCost={removeCost}
                      onRemoveOption={() => doRemoveOption(o.name)}
                      removing={opBusy}
                    />
                  ))}
                </ul>
              )}

              {/* Add a new option to this group (Loyverse). */}
              <div className="mt-2 flex items-center gap-2 border-t border-slate-800/60 pt-2">
                <input
                  type="text"
                  value={newOptName}
                  onChange={(e) => setNewOptName(e.target.value)}
                  placeholder="New option name"
                  className="flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200"
                />
                <span className="text-[11px] text-slate-500">฿</span>
                <input
                  type="number"
                  value={newOptPrice}
                  onChange={(e) => setNewOptPrice(e.target.value)}
                  className="w-16 rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-right text-xs text-slate-200"
                />
                <button
                  type="button"
                  onClick={doAddOption}
                  disabled={opBusy || !newOptName.trim()}
                  className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
                >
                  <Plus className="h-3 w-3" /> Add option
                </button>
              </div>
              {opBusy && <p className="pt-1 text-[11px] text-slate-500">Syncing with Loyverse…</p>}
            </section>

            {/* Attached dishes (the "pick a group, see its dishes" summary) */}
            <section className="px-4 py-3">
              <h4 className="pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Attached dishes ({selDishes.length})
              </h4>
              {err && <p className="pb-2 text-xs text-rose-400">{err}</p>}
              {selDishes.length === 0 ? (
                <p className="text-xs text-slate-600">Not attached to any dish yet.</p>
              ) : (
                <ul className="flex flex-wrap gap-2 pb-2">
                  {selDishes.map((d) => (
                    <li key={d.id}>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-200">
                        {d.name}
                        <button
                          type="button"
                          onClick={() => run(detach(d.id, sel.id))}
                          disabled={busy}
                          className="text-slate-500 hover:text-rose-300 disabled:opacity-50"
                          title="Detach"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Add dish to this group — searchable */}
              <div className="relative max-w-md pt-1">
                <div className="flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-2 py-1">
                  <Search className="h-3 w-3 shrink-0 text-slate-500" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search dish to add…"
                    className="w-full bg-transparent text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none"
                  />
                </div>
                {q && (
                  <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded border border-slate-700 bg-slate-950 shadow-lg">
                    {matches.length === 0 ? (
                      <li className="px-2 py-1.5 text-xs text-slate-600">No matching dishes</li>
                    ) : (
                      matches.map((d) => (
                        <li key={d.id}>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={async () => { await run(attach(d.id, sel.id)); setQuery('') }}
                            className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                          >
                            <span className="flex items-center gap-1.5">
                              <Plus className="h-3 w-3 text-emerald-400" />
                              {d.name}
                            </span>
                            <span className="text-[10px] text-slate-500">{d.category ?? 'Uncategorized'}</span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
