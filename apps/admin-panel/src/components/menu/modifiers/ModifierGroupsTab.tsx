import { useState } from 'react'
import { ChevronRight, X, Plus } from 'lucide-react'
import type {
  LoyverseModifierListRow,
  LoyverseModifierOptionRow,
} from '../../../hooks/useLoyverseModifierPull'
import type { DishRow } from '../../../hooks/useDishModifierGroups'

interface Props {
  lists: LoyverseModifierListRow[]
  options: LoyverseModifierOptionRow[]
  dishes: DishRow[]
  attachmentsByDish: Record<string, string[]>
  attach: (dishId: string, listId: string) => Promise<{ ok: boolean; error?: string }>
  detach: (dishId: string, listId: string) => Promise<{ ok: boolean; error?: string }>
}

// Phase 3 (redesign, MC 38911fde): "by group" master-detail, Loyverse-style.
// Left: list of modifier groups. Right (selected group): its options (read-only,
// like Loyverse) + the summary of which dishes it is attached to, with add/remove.
export function ModifierGroupsTab({ lists, options, dishes, attachmentsByDish, attach, detach }: Props) {
  const [selId, setSelId] = useState<string | null>(lists[0]?.id ?? null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [addDishId, setAddDishId] = useState('')

  const sel = lists.find((l) => l.id === selId) ?? null
  const dishesForGroup = (listId: string) =>
    dishes.filter((d) => (attachmentsByDish[d.id] ?? []).includes(listId))

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
                onClick={() => { setSelId(l.id); setErr(null); setAddDishId('') }}
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

            {/* Options (read-only, like Loyverse) */}
            <section className="px-4 py-3">
              <h4 className="pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Options</h4>
              {selOptions.length === 0 ? (
                <p className="text-xs text-slate-600">(no options)</p>
              ) : (
                <ul className="space-y-1">
                  {selOptions.map((o) => (
                    <li key={o.id} className="flex items-center justify-between text-xs">
                      <span className="text-slate-300">{o.name}</span>
                      <span className="text-slate-500">{o.price != null ? `฿${o.price.toFixed(0)}` : '—'}</span>
                    </li>
                  ))}
                </ul>
              )}
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

              {/* Add dish to this group */}
              <div className="flex items-center gap-2 pt-1">
                <select
                  value={addDishId}
                  onChange={(e) => setAddDishId(e.target.value)}
                  className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200"
                >
                  <option value="">— add a dish —</option>
                  {unattachedDishes.map((d) => (
                    <option key={d.id} value={d.id}>{d.product_code} · {d.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!addDishId || busy}
                  onClick={async () => { await run(attach(addDishId, sel.id)); setAddDishId('') }}
                  className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
                >
                  <Plus className="h-3 w-3" /> Add
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
