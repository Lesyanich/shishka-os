import { Filter } from 'lucide-react'

export interface GraphFiltersState {
  enabledTypes: Set<string>
  showIsolated: boolean
  maxNodes: number
}

interface GraphFiltersProps {
  allTypes: string[]
  typeColor: (type: string) => string
  state: GraphFiltersState
  onChange: (next: GraphFiltersState) => void
  isolatedCount: number
}

const MAX_NODES_OPTIONS = [100, 500, 1000, 5000]

export function GraphFilters({
  allTypes,
  typeColor,
  state,
  onChange,
  isolatedCount,
}: GraphFiltersProps) {
  function toggleType(type: string) {
    const next = new Set(state.enabledTypes)
    if (next.has(type)) next.delete(type)
    else next.add(type)
    onChange({ ...state, enabledTypes: next })
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-4 border-l border-slate-800 bg-slate-950 px-4 py-3 text-xs text-slate-300">
      <header className="flex items-center gap-2 text-slate-200">
        <Filter className="h-3.5 w-3.5" />
        <span className="font-semibold">Filters</span>
      </header>

      <section>
        <h3 className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">Entity types</h3>
        {allTypes.length === 0 ? (
          <p className="text-slate-600">No types yet.</p>
        ) : (
          <ul className="space-y-1">
            {allTypes.map((type) => {
              const enabled = state.enabledTypes.has(type)
              return (
                <li key={type}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-slate-900">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={() => toggleType(type)}
                      className="h-3 w-3 accent-fuchsia-500"
                    />
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: typeColor(type) }}
                    />
                    <span className="truncate">{type || '(unknown)'}</span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">Isolated nodes</h3>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={state.showIsolated}
            onChange={(e) => onChange({ ...state, showIsolated: e.target.checked })}
            className="h-3 w-3 accent-fuchsia-500"
          />
          <span>Show isolated ({isolatedCount})</span>
        </label>
      </section>

      <section>
        <h3 className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">Max nodes</h3>
        <div className="flex flex-wrap gap-1.5">
          {MAX_NODES_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onChange({ ...state, maxNodes: opt })}
              className={[
                'rounded border px-2 py-0.5 text-[11px] transition',
                state.maxNodes === opt
                  ? 'border-fuchsia-400 bg-fuchsia-500/10 text-fuchsia-200'
                  : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200',
              ].join(' ')}
            >
              {opt}
            </button>
          ))}
        </div>
      </section>
    </aside>
  )
}
