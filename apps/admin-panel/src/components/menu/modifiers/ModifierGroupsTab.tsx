import { useState } from 'react'
import { ChevronRight, X, Plus, Search } from 'lucide-react'
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
  const [query, setQuery] = useState('')

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
