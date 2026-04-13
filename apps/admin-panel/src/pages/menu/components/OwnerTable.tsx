import { useOptimistic, useState, useCallback } from 'react'
import { Check, X, Star, StarOff } from 'lucide-react'
import type { MenuDish } from '../../../hooks/useMenuDishes'

interface OwnerTableProps {
  dishes: MenuDish[]
  selectedCategory: string | null
  onUpdate: (id: string, patch: Partial<Pick<MenuDish, 'name' | 'price' | 'is_available' | 'is_featured'>>) => Promise<{ ok: boolean; error?: string }>
}

function foodCostColor(pct: number): string {
  if (pct < 30) return 'text-emerald-400 bg-emerald-500/10'
  if (pct <= 45) return 'text-amber-400 bg-amber-500/10'
  return 'text-rose-400 bg-rose-500/10'
}

function formatThb(v: number | null): string {
  if (v == null) return '-'
  return `\u0E3F${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

interface EditState {
  id: string
  name: string
  price: string
}

export function OwnerTable({ dishes, selectedCategory, onUpdate }: OwnerTableProps) {
  const filtered = selectedCategory
    ? dishes.filter((d) => d.category_id === selectedCategory)
    : dishes

  const [optimisticDishes, setOptimistic] = useOptimistic(
    filtered,
    (state: MenuDish[], update: { id: string; patch: Partial<MenuDish> }) =>
      state.map((d) => (d.id === update.id ? { ...d, ...update.patch } : d)),
  )

  const [editing, setEditing] = useState<EditState | null>(null)

  const startEdit = useCallback((dish: MenuDish) => {
    setEditing({
      id: dish.id,
      name: dish.name,
      price: dish.price?.toString() ?? '',
    })
  }, [])

  const cancelEdit = useCallback(() => {
    setEditing(null)
  }, [])

  const saveEdit = useCallback(async () => {
    if (!editing) return
    const patch: Partial<Pick<MenuDish, 'name' | 'price'>> = {}
    const original = filtered.find((d) => d.id === editing.id)
    if (!original) return

    if (editing.name !== original.name) patch.name = editing.name
    const newPrice = editing.price ? Number(editing.price) : null
    if (newPrice !== original.price) patch.price = newPrice

    if (Object.keys(patch).length === 0) {
      setEditing(null)
      return
    }

    setOptimistic({ id: editing.id, patch })
    setEditing(null)
    await onUpdate(editing.id, patch)
  }, [editing, filtered, onUpdate, setOptimistic])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') saveEdit()
      if (e.key === 'Escape') cancelEdit()
    },
    [saveEdit, cancelEdit],
  )

  const toggleField = useCallback(
    async (dish: MenuDish, field: 'is_available' | 'is_featured') => {
      const newVal = !dish[field]
      setOptimistic({ id: dish.id, patch: { [field]: newVal } })
      await onUpdate(dish.id, { [field]: newVal })
    },
    [onUpdate, setOptimistic],
  )

  if (optimisticDishes.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-slate-500">
        No dishes in this category.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-800">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-900/50 text-left text-[10px] uppercase tracking-wider text-slate-500">
            <th className="px-3 py-2.5">Name</th>
            <th className="px-3 py-2.5">Category</th>
            <th className="px-3 py-2.5 text-right">Price</th>
            <th className="px-3 py-2.5 text-right">Cost</th>
            <th className="px-3 py-2.5 text-right">Food Cost %</th>
            <th className="px-3 py-2.5 text-right">Margin</th>
            <th className="px-3 py-2.5 text-center">Available</th>
            <th className="px-3 py-2.5 text-center">Featured</th>
          </tr>
        </thead>
        <tbody>
          {optimisticDishes.map((dish) => {
            const isEditing = editing?.id === dish.id
            const cost = dish.cost_per_unit ?? 0
            const price = dish.price ?? 0
            const foodCostPct = price > 0 ? (cost / price) * 100 : 0
            const margin = price - cost

            return (
              <tr
                key={dish.id}
                className="border-b border-slate-800/50 transition hover:bg-slate-800/30"
              >
                {/* Name */}
                <td className="px-3 py-2">
                  {isEditing ? (
                    <div className="flex items-center gap-1">
                      <input
                        value={editing.name}
                        onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                        onKeyDown={handleKeyDown}
                        className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
                        autoFocus
                      />
                      <button onClick={saveEdit} className="rounded bg-emerald-600 p-0.5 text-white hover:bg-emerald-500">
                        <Check className="h-3 w-3" />
                      </button>
                      <button onClick={cancelEdit} className="rounded bg-slate-700 p-0.5 text-slate-300 hover:bg-slate-600">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEdit(dish)}
                      className="text-left font-medium text-slate-100"
                    >
                      {dish.name}
                    </button>
                  )}
                </td>

                {/* Category */}
                <td className="px-3 py-2">
                  {dish.category_name ? (
                    <span className="inline-flex rounded-full bg-slate-700/50 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                      {dish.category_name}
                    </span>
                  ) : (
                    <span className="text-slate-600">-</span>
                  )}
                </td>

                {/* Price */}
                <td className="px-3 py-2 text-right">
                  {isEditing ? (
                    <input
                      value={editing.price}
                      onChange={(e) => setEditing({ ...editing, price: e.target.value })}
                      onKeyDown={handleKeyDown}
                      className="w-20 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-right text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
                      type="number"
                      min={0}
                    />
                  ) : (
                    <span className="font-medium text-slate-100">{formatThb(dish.price)}</span>
                  )}
                </td>

                {/* Cost */}
                <td className="px-3 py-2 text-right text-slate-400">
                  {formatThb(dish.cost_per_unit)}
                </td>

                {/* Food Cost % */}
                <td className="px-3 py-2 text-right">
                  {price > 0 ? (
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${foodCostColor(foodCostPct)}`}>
                      {foodCostPct.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-slate-600">-</span>
                  )}
                </td>

                {/* Margin */}
                <td className="px-3 py-2 text-right">
                  {price > 0 ? (
                    <span className={margin > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      {formatThb(margin)}
                    </span>
                  ) : (
                    <span className="text-slate-600">-</span>
                  )}
                </td>

                {/* Available toggle */}
                <td className="px-3 py-2 text-center">
                  <button
                    onClick={() => toggleField(dish, 'is_available')}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${
                      dish.is_available ? 'bg-emerald-600' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                        dish.is_available ? 'translate-x-4' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </td>

                {/* Featured toggle */}
                <td className="px-3 py-2 text-center">
                  <button
                    onClick={() => toggleField(dish, 'is_featured')}
                    className={`transition ${
                      dish.is_featured ? 'text-amber-400 hover:text-amber-300' : 'text-slate-600 hover:text-slate-400'
                    }`}
                  >
                    {dish.is_featured ? <Star className="h-4 w-4" /> : <StarOff className="h-4 w-4" />}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
