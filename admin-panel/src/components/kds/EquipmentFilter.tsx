interface EquipmentFilterProps {
  categories: string[]
  selected: string | null
  onSelect: (c: string | null) => void
}

export function EquipmentFilter({
  categories,
  selected,
  onSelect,
}: EquipmentFilterProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => onSelect(null)}
        className={[
          'rounded-full px-3 py-1 text-xs font-medium transition',
          selected === null
            ? 'bg-emerald-500/20 text-emerald-300'
            : 'bg-slate-800 text-slate-400 hover:text-slate-200',
        ].join(' ')}
      >
        All
      </button>
      {categories.map((cat) => (
        <button
          key={cat}
          onClick={() => onSelect(cat)}
          className={[
            'rounded-full px-3 py-1 text-xs font-medium transition',
            selected === cat
              ? 'bg-emerald-500/20 text-emerald-300'
              : 'bg-slate-800 text-slate-400 hover:text-slate-200',
          ].join(' ')}
        >
          {cat}
        </button>
      ))}
    </div>
  )
}
