import { useState } from 'react'
import { Check, Plus } from 'lucide-react'
import type { LoyverseModifierListRow } from '../../../hooks/useLoyverseModifierPull'
import { useDishModifierGroups } from '../../../hooks/useDishModifierGroups'

interface Props {
  lists: LoyverseModifierListRow[]
}

// Phase 4 (MC 38911fde): pick a SALE dish, see + edit which modifier GROUPS attach to
// it (toggle on/off). Writes to dish_modifier_groups only; the live POS is updated by
// the orchestrated Push (Phase 5), which re-attaches groups to items as its LAST step.
export function DishGroupAttachEditor({ lists }: Props) {
  const { dishes, attachmentsByDish, error, attach, detach } = useDishModifierGroups()
  const [dishId, setDishId] = useState<string>('')
  const [busyList, setBusyList] = useState<string | null>(null)
  const [rowErr, setRowErr] = useState<string | null>(null)

  const attached = new Set(attachmentsByDish[dishId] ?? [])

  const toggle = async (listId: string) => {
    if (!dishId) return
    setBusyList(listId)
    setRowErr(null)
    const res = attached.has(listId) ? await detach(dishId, listId) : await attach(dishId, listId)
    setBusyList(null)
    if (!res.ok) setRowErr(res.error ?? 'failed')
  }

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/40">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-200">Dish → modifier groups</h2>
        <span className="text-xs text-slate-500">attach groups to a dish · pushes to Loyverse later</span>
      </header>

      <div className="space-y-3 p-4">
        <select
          value={dishId}
          onChange={(e) => { setDishId(e.target.value); setRowErr(null) }}
          className="w-full max-w-md rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-200"
        >
          <option value="">— pick a dish (SALE-*) —</option>
          {dishes.map((d) => (
            <option key={d.id} value={d.id}>
              {d.product_code} · {d.name}
            </option>
          ))}
        </select>

        {error && <p className="text-xs text-rose-400">{error}</p>}
        {rowErr && <p className="text-xs text-rose-400">{rowErr}</p>}

        {dishId && (
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
        )}

        {dishId && attached.size === 0 && (
          <p className="text-xs text-slate-600">No groups attached to this dish yet.</p>
        )}
      </div>
    </section>
  )
}
