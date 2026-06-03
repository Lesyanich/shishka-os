import { useState } from 'react'
import { ChevronRight, Check, Plus } from 'lucide-react'
import type { LoyverseModifierListRow } from '../../../hooks/useLoyverseModifierPull'
import type { DishRow } from '../../../hooks/useDishModifierGroups'

interface Props {
  lists: LoyverseModifierListRow[]
  dishes: DishRow[]
  attachmentsByDish: Record<string, string[]>
  attach: (dishId: string, listId: string) => Promise<{ ok: boolean; error?: string }>
  detach: (dishId: string, listId: string) => Promise<{ ok: boolean; error?: string }>
}

// Phase 4 (redesign, MC 38911fde): "by dish" master-detail. Left: dishes. Right
// (selected dish): drill in and toggle which modifier groups apply — the thing that
// kept silently breaking in Loyverse. Writes dish_modifier_groups; push is Phase 5.
export function ModifierDishesTab({ lists, dishes, attachmentsByDish, attach, detach }: Props) {
  const [selId, setSelId] = useState<string | null>(dishes[0]?.id ?? null)
  const [busyList, setBusyList] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [catFilter, setCatFilter] = useState<string>('all')

  const categories = Array.from(new Set(dishes.map((d) => d.category ?? 'Uncategorized'))).sort()
  const visibleDishes =
    catFilter === 'all' ? dishes : dishes.filter((d) => (d.category ?? 'Uncategorized') === catFilter)

  const sel = dishes.find((d) => d.id === selId) ?? null
  const attached = new Set(sel ? attachmentsByDish[sel.id] ?? [] : [])

  const toggle = async (listId: string) => {
    if (!sel) return
    setBusyList(listId)
    setErr(null)
    const res = attached.has(listId) ? await detach(sel.id, listId) : await attach(sel.id, listId)
    setBusyList(null)
    if (!res.ok) setErr(res.error ?? 'failed')
  }

  if (dishes.length === 0) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-500">
        No SALE-* dishes found.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[260px_1fr]">
      {/* Master: dish list (filterable by category) */}
      <div className="space-y-2">
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200"
        >
          <option value="all">All categories ({dishes.length})</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c} ({dishes.filter((d) => (d.category ?? 'Uncategorized') === c).length})
            </option>
          ))}
        </select>
        <ul className="max-h-[70vh] overflow-y-auto rounded-lg border border-slate-800 bg-slate-900/40">
          {visibleDishes.length === 0 ? (
            <li className="px-3 py-2.5 text-xs text-slate-600">No dishes in this category.</li>
          ) : visibleDishes.map((d) => {
          const isSel = d.id === selId
          const count = (attachmentsByDish[d.id] ?? []).length
          return (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => { setSelId(d.id); setErr(null) }}
                className={[
                  'flex w-full items-center justify-between border-b border-slate-800/70 px-3 py-2.5 text-left',
                  isSel ? 'bg-emerald-500/10' : 'hover:bg-slate-900',
                ].join(' ')}
              >
                <span>
                  <span className={isSel ? 'text-sm font-medium text-emerald-200' : 'text-sm text-slate-200'}>
                    {d.name}
                  </span>
                  <span className="block text-[11px] text-slate-500">{d.product_code} · {count} groups</span>
                </span>
                <ChevronRight className={['h-3.5 w-3.5', isSel ? 'text-emerald-300' : 'text-slate-600'].join(' ')} />
              </button>
            </li>
          )
        })}
        </ul>
      </div>

      {/* Detail: selected dish → group toggles */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/40">
        {!sel ? (
          <div className="p-6 text-sm text-slate-500">Pick a dish on the left.</div>
        ) : (
          <div className="space-y-3 p-4">
            <header>
              <h3 className="text-sm font-semibold text-slate-100">{sel.name}</h3>
              <p className="text-[11px] text-slate-500">{sel.product_code} · {attached.size} groups attached</p>
            </header>
            {err && <p className="text-xs text-rose-400">{err}</p>}
            <ul className="flex flex-wrap gap-2">
              {lists.map((l) => {
                const on = attached.has(l.id)
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => toggle(l.id)}
                      disabled={busyList === l.id}
                      className={[
                        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors disabled:opacity-50',
                        on
                          ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                          : 'bg-slate-800 text-slate-400 hover:bg-slate-700',
                      ].join(' ')}
                      title={on ? 'Click to detach' : 'Click to attach'}
                    >
                      {on ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                      {l.name}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
