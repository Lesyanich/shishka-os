import { useState } from 'react'
import { ChevronDown, CheckCircle2, AlertCircle } from 'lucide-react'
import type {
  LoyverseModifierListRow,
  LoyverseModifierOptionRow,
} from '../../../hooks/useLoyverseModifierPull'

const KNOWN_SLOTS = ['base', 'protein', 'greens', 'topping', 'sauce']

interface Props {
  lists: LoyverseModifierListRow[]
  options: LoyverseModifierOptionRow[]
}

export function PulledMirrorSection({ lists, options }: Props) {
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
        No Loyverse modifier_lists pulled yet. Click &quot;Pull now&quot; above.
      </section>
    )
  }

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/40">
      <header className="border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-200">Pulled from Loyverse (read-only)</h2>
      </header>
      <ul className="divide-y divide-slate-800">
        {lists.map((l) => {
          const isOpen = openIds.has(l.id)
          const slotMatch = KNOWN_SLOTS.includes(l.name.toLowerCase())
          const listOpts = options.filter((o) => o.list_id === l.id)
          return (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => toggle(l.id)}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-slate-900"
              >
                <span className="flex items-center gap-2">
                  {slotMatch ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-amber-400" />
                  )}
                  <span className="text-sm font-medium text-slate-200">{l.name}</span>
                  <span className="text-xs text-slate-500">
                    (min:{l.min_select ?? '–'} max:{l.max_select ?? '–'}) — {listOpts.length} options
                  </span>
                </span>
                <ChevronDown
                  className={[
                    'h-3.5 w-3.5 text-slate-500 transition-transform',
                    isOpen ? '' : '-rotate-90',
                  ].join(' ')}
                />
              </button>
              {isOpen && (
                <ul className="border-t border-slate-800 bg-slate-950/50 px-4 py-2">
                  {listOpts.length === 0 ? (
                    <li className="py-1 text-xs text-slate-600">(no options)</li>
                  ) : (
                    listOpts.map((o) => (
                      <li key={o.id} className="flex items-center justify-between py-1 text-xs">
                        <span className="text-slate-300">{o.name}</span>
                        <span className="text-slate-500">
                          {o.price != null ? `฿${o.price.toFixed(0)}` : '—'}
                        </span>
                      </li>
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
