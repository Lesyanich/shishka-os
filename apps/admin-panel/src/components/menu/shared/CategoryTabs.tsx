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
    'shrink-0 px-3 py-1.5 text-base font-medium transition border-b-2 -mb-px'
  const activeCls = 'border-brick text-cream'
  const idleCls = 'border-transparent text-muted hover:text-cream'
  const countCls = 'ml-1.5 font-mono text-[10px] tabular-nums text-faint'

  const allCount = readCount(counts, null)

  const fontStyle = { fontFamily: 'var(--font-display)', fontWeight: 500 }

  return (
    <div className="flex gap-5 overflow-x-auto border-b border-surface-3">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`${baseCls} ${selectedId === null ? activeCls : idleCls}`}
        style={fontStyle}
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
            style={fontStyle}
          >
            {cat.name}
            {n != null && <span className={countCls}>{n}</span>}
          </button>
        )
      })}
    </div>
  )
}
