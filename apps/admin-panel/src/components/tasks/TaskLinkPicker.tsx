import { useEffect, useMemo, useState } from 'react'
import { Link2, Search, X } from 'lucide-react'
import { useMenuData } from '../../hooks/useMenuData'
import type { TaskStation } from '../../hooks/useStaffTasks'
import { FIXED_LINKS, buildDishLink, type TaskLink } from '../../lib/taskLinks'

type Mode = 'none' | 'dish' | 'page'

interface PickedDish {
  code: string
  name: string
  name_th: string | null
}

export interface TaskLinkValue {
  linked_route: string | null
  linked_label: string | null
  linked_label_th: string | null
}

interface TaskLinkPickerProps {
  value: TaskLinkValue
  /** Station drives which recipe tab a dish link opens (L2 → assembler). */
  station: TaskStation
  onChange: (next: TaskLinkValue) => void
}

const INPUT =
  'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none'
const LABEL = 'mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500'

function inferMode(route: string | null): Mode {
  if (!route) return 'none'
  if (route.startsWith('/kitchen/recipes?dish=')) return 'dish'
  return 'page'
}

const EMPTY: TaskLinkValue = { linked_route: null, linked_label: null, linked_label_th: null }

function toValue(link: TaskLink): TaskLinkValue {
  return { linked_route: link.route, linked_label: link.label, linked_label_th: link.label_th }
}

export function TaskLinkPicker({ value, station, onChange }: TaskLinkPickerProps) {
  const [mode, setMode] = useState<Mode>(() => inferMode(value.linked_route))
  const [query, setQuery] = useState('')
  const [dish, setDish] = useState<PickedDish | null>(null)

  const { items } = useMenuData()

  // Keep a dish link's station tab in sync if the task's station changes.
  useEffect(() => {
    if (mode !== 'dish' || !dish) return
    onChange(toValue(buildDishLink(dish.code, dish.name, station, dish.name_th)))
    // onChange identity is stable enough for our parents; we only react to
    // station / dish changes here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station, dish, mode])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    return items
      .filter((i) => {
        const hay = `${i.name} ${i.product_code} ${i.customer_short_name ?? ''}`.toLowerCase()
        return hay.includes(q)
      })
      .slice(0, 8)
  }, [items, query])

  const switchMode = (next: Mode) => {
    setMode(next)
    setDish(null)
    setQuery('')
    if (next === 'none') onChange(EMPTY)
  }

  const pickDish = (i: { product_code: string; name: string; customer_short_name: string | null }) => {
    const picked: PickedDish = { code: i.product_code, name: i.name, name_th: i.customer_short_name }
    setDish(picked)
    setQuery('')
    onChange(toValue(buildDishLink(picked.code, picked.name, station, picked.name_th)))
  }

  const pickPage = (id: string) => {
    const opt = FIXED_LINKS.find((f) => f.id === id)
    onChange(opt ? toValue(opt) : EMPTY)
  }

  return (
    <div>
      <label className={LABEL}>
        <Link2 className="mr-1 inline h-3 w-3" />
        Linked tab (optional)
      </label>

      {/* Mode chips */}
      <div className="mb-2 flex gap-1.5">
        {(['none', 'dish', 'page'] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => switchMode(m)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              mode === m
                ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {m === 'none' ? 'No link' : m === 'dish' ? 'Dish recipe' : 'Page'}
          </button>
        ))}
      </div>

      {/* Current selection */}
      {value.linked_route && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-200">
          <Link2 className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{value.linked_label}</span>
          <button
            type="button"
            onClick={() => switchMode('none')}
            className="rounded p-0.5 text-emerald-300/70 hover:bg-emerald-500/20 hover:text-emerald-100"
            title="Remove link"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Dish typeahead */}
      {mode === 'dish' && !value.linked_route && (
        <div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-600" />
            <input
              className={`${INPUT} pl-8`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search dish or prep (e.g. hummus)…"
            />
          </div>
          {matches.length > 0 && (
            <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900">
              {matches.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => pickDish(i)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800"
                >
                  <span className="truncate">{i.name}</span>
                  <span className="shrink-0 text-[10px] text-slate-500">{i.product_code}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Fixed page select */}
      {mode === 'page' && !value.linked_route && (
        <select className={INPUT} defaultValue="" onChange={(e) => pickPage(e.target.value)}>
          <option value="" disabled>
            Choose a page…
          </option>
          {FIXED_LINKS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
