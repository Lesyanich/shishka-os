import { useMemo, useState } from 'react'
import { Search, ChevronLeft, Loader2, Tag } from 'lucide-react'
import { usePrepLabelItems } from '../hooks/usePrepLabelItems'
import { usePfPackCard } from '../hooks/usePfPackCard'
import { PrepLabelBlock, type PrepLabelItem } from '../components/menu/drawer/PrepLabelBlock'

/**
 * Kitchen label station (cook-accessible). Lets L1 cooks pick a prep item and
 * print its 60×40 storage label to the XP-420B via RawBT — the same Storage
 * Label control that lives in the owner menu drawer, surfaced on the floor.
 */
export function KitchenLabels() {
  const { items, isLoading, error } = usePrepLabelItems()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<PrepLabelItem | null>(null)
  const { card } = usePfPackCard(selected?.id ?? null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.product_code.toLowerCase().includes(q),
    )
  }, [items, query])

  if (selected) {
    return (
      <div className="mx-auto max-w-md p-4">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="mb-4 flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200"
        >
          <ChevronLeft className="h-4 w-4" /> Все заготовки
        </button>

        <div className="mb-4">
          <h1 className="text-lg font-semibold text-slate-100">{selected.name}</h1>
          <p className="text-xs text-slate-500">{selected.product_code}</p>
        </div>

        <PrepLabelBlock item={selected} card={card} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl p-4">
      <div className="mb-4 flex items-center gap-2">
        <Tag className="h-5 w-5 text-amber-400" />
        <h1 className="text-lg font-semibold text-slate-100">Этикетки заготовок</h1>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск заготовки…"
          className="w-full rounded-xl border border-slate-700 bg-slate-900 py-3 pl-10 pr-3 text-sm text-slate-100 outline-none focus:border-amber-500/60"
        />
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20 text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Загрузка…
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
          Не удалось загрузить заготовки: {error}
        </p>
      )}

      {!isLoading && !error && filtered.length === 0 && (
        <p className="py-20 text-center text-sm text-slate-500">Ничего не найдено.</p>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {filtered.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSelected(item)}
            className="flex flex-col items-start gap-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-left transition hover:border-amber-500/50 hover:bg-slate-800"
          >
            <span className="text-sm font-medium text-slate-100">{item.name}</span>
            <span className="text-[11px] text-slate-500">{item.product_code}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
