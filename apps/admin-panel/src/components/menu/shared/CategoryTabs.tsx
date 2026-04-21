import type { MenuCategorySummary } from './types'

interface CategoryTabsProps {
  categories: MenuCategorySummary[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  allLabel?: string
  /** Map of category id → live count. When provided, counts render as a
   * dimmed tabular suffix beside each tab name. `null` key = the "All" tab. */
  counts?: Map<string | null, number> | Record<string, number>
}

function readCount(
  counts: CategoryTabsProps['counts'],
  key: string | null,
): number | null {
  if (!counts) return null
  if (counts instanceof Map) {
    return counts.get(key) ?? null
  }
  // Record: null key → 'all'
  const lookup = key ?? 'all'
  const v = counts[lookup]
  return typeof v === 'number' ? v : null
}

export function CategoryTabs({
  categories,
  selectedId,
  onSelect,
  allLabel = 'All',
  counts,
}: CategoryTabsProps) {
  if (categories.length === 0) return null

  const baseCls =
    'shrink-0 rounded-full px-3 py-1 text-xs font-medium transition'
  const activeCls = 'bg-emerald-500/15 text-emerald-300'
  const idleCls = 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
  const countCls = 'ml-1.5 font-mono text-[10px] tabular-nums opacity-60'

  const allCount = readCount(counts, null)

  return (
    <div className="flex gap-1 overflow-x-auto pb-1">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`${baseCls} ${selectedId === null ? activeCls : idleCls}`}
      >
        {allLabel}
        {allCount != null && <span className={countCls}>{allCount}</span>}
      </button>
      {categories.map((cat) => {
        const n = readCount(counts, cat.id)
        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => onSelect(cat.id)}
            className={`${baseCls} ${selectedId === cat.id ? activeCls : idleCls}`}
          >
            {cat.name}
            {n != null && <span className={countCls}>{n}</span>}
          </button>
        )
      })}
    </div>
  )
}
