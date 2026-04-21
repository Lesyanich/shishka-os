import type { MenuCategorySummary } from './types'

interface CategoryTabsProps {
  categories: MenuCategorySummary[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  allLabel?: string
}

export function CategoryTabs({
  categories,
  selectedId,
  onSelect,
  allLabel = 'All',
}: CategoryTabsProps) {
  if (categories.length === 0) return null

  const baseCls =
    'shrink-0 rounded-full px-3 py-1 text-xs font-medium transition'
  const activeCls = 'bg-emerald-500/15 text-emerald-300'
  const idleCls = 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'

  return (
    <div className="flex gap-1 overflow-x-auto pb-1">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`${baseCls} ${selectedId === null ? activeCls : idleCls}`}
      >
        {allLabel}
      </button>
      {categories.map((cat) => (
        <button
          key={cat.id}
          type="button"
          onClick={() => onSelect(cat.id)}
          className={`${baseCls} ${selectedId === cat.id ? activeCls : idleCls}`}
        >
          {cat.name}
        </button>
      ))}
    </div>
  )
}
