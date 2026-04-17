import { Fragment, useEffect, useOptimistic, useState, useCallback, useMemo, useRef } from 'react'
import { Check, X, Star, StarOff, ChevronDown, ChevronRight } from 'lucide-react'
import type { MenuDish, MenuSubcategory, PortionUnit } from '../../../hooks/useMenuDishes'
import { DishExpandedCard } from './DishExpandedCard'

interface OwnerTableProps {
  dishes: MenuDish[]
  selectedCategory: string | null
  subcategories: Map<string, MenuSubcategory[]>
  onUpdate: (id: string, patch: Partial<Pick<MenuDish, 'name' | 'description' | 'price' | 'is_available' | 'is_featured' | 'portion_size' | 'portion_unit'>>) => Promise<{ ok: boolean; error?: string }>
  /** Imperative trigger: when this id changes, auto-expand that row and scroll to it. */
  autoExpandId?: string | null
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

function hasNutrition(dish: MenuDish): boolean {
  return dish.calories != null || dish.protein != null || dish.carbs != null || dish.fat != null
}

function formatPortion(dish: MenuDish): string {
  if (dish.portion_size == null || dish.portion_unit == null) return '-'
  return `${dish.portion_size}${dish.portion_unit}`
}

function pricePer100(price: number | null, portionSize: number | null, portionUnit: PortionUnit | null): number | null {
  if (price == null || portionSize == null || portionSize <= 0) return null
  if (portionUnit === 'pcs') return null
  return (price / portionSize) * 100
}

interface EditState {
  id: string
  name: string
  price: string
}

interface PortionEditState {
  id: string
  size: string
  unit: PortionUnit
}

type GroupItem =
  | { type: 'l2-header'; subcategory: MenuSubcategory; dishCount: number }
  | { type: 'dish'; dish: MenuDish }

export function OwnerTable({ dishes, selectedCategory, subcategories, onUpdate, autoExpandId }: OwnerTableProps) {
  const filtered = selectedCategory
    ? dishes.filter((d) => d.category_id === selectedCategory)
    : dishes

  const [optimisticDishes, setOptimistic] = useOptimistic(
    filtered,
    (state: MenuDish[], update: { id: string; patch: Partial<MenuDish> }) =>
      state.map((d) => (d.id === update.id ? { ...d, ...update.patch } : d)),
  )

  const [editing, setEditing] = useState<EditState | null>(null)
  const [portionEditing, setPortionEditing] = useState<PortionEditState | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Imperative auto-expand: when parent sets autoExpandId to a new value,
  // expand that row and scroll it into view. Fires once per id change.
  const lastAutoExpandId = useRef<string | null>(null)
  useEffect(() => {
    if (autoExpandId && autoExpandId !== lastAutoExpandId.current) {
      lastAutoExpandId.current = autoExpandId
      setExpandedId(autoExpandId)
      // Defer scroll to after the row renders
      setTimeout(() => {
        const el = document.querySelector<HTMLElement>(`[data-dish-row="${autoExpandId}"]`)
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    }
  }, [autoExpandId])

  const toggleExpand = useCallback((dishId: string) => {
    setExpandedId((prev) => (prev === dishId ? null : dishId))
  }, [])

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

  const startPortionEdit = useCallback((dish: MenuDish) => {
    setPortionEditing({
      id: dish.id,
      size: dish.portion_size?.toString() ?? '',
      unit: dish.portion_unit ?? 'g',
    })
  }, [])

  const cancelPortionEdit = useCallback(() => {
    setPortionEditing(null)
  }, [])

  const savePortionEdit = useCallback(async () => {
    if (!portionEditing) return
    const original = filtered.find((d) => d.id === portionEditing.id)
    if (!original) return

    const newSize = portionEditing.size ? Number(portionEditing.size) : null
    const newUnit = newSize != null ? portionEditing.unit : null

    if (newSize === original.portion_size && newUnit === original.portion_unit) {
      setPortionEditing(null)
      return
    }

    setOptimistic({ id: portionEditing.id, patch: { portion_size: newSize, portion_unit: newUnit } })
    setPortionEditing(null)
    await onUpdate(portionEditing.id, { portion_size: newSize, portion_unit: newUnit })
  }, [portionEditing, filtered, onUpdate, setOptimistic])

  const handlePortionKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') savePortionEdit()
      if (e.key === 'Escape') cancelPortionEdit()
    },
    [savePortionEdit, cancelPortionEdit],
  )

  // Group dishes with L2 subcategory headers.
  // A dish's category_id may point to either an L1 category OR an L2 subcategory
  // (the join returns whatever row matches). Render an L2 header only when at
  // least one dish actually references that L2 — prevents empty dividers.
  const groupedDishes = useMemo((): GroupItem[] => {
    const relevantL1Ids = selectedCategory
      ? [selectedCategory]
      : (Array.from(new Set(optimisticDishes.map((d) => d.category_id).filter(Boolean))) as string[])

    const groups: GroupItem[] = []
    const claimed = new Set<string>()

    for (const catId of relevantL1Ids) {
      const l2s = subcategories.get(catId) ?? []
      const directDishes = optimisticDishes.filter((d) => d.category_id === catId)

      if (l2s.length === 0) {
        for (const dish of directDishes) {
          groups.push({ type: 'dish', dish })
          claimed.add(dish.id)
        }
        continue
      }

      // Dishes directly under the L1 (no L2 match) render first without a header
      for (const dish of directDishes) {
        groups.push({ type: 'dish', dish })
        claimed.add(dish.id)
      }

      // Then each non-empty L2: header + its dishes
      for (const l2 of l2s) {
        const l2Dishes = optimisticDishes.filter((d) => d.category_id === l2.id)
        if (l2Dishes.length === 0) continue
        groups.push({ type: 'l2-header', subcategory: l2, dishCount: l2Dishes.length })
        for (const dish of l2Dishes) {
          groups.push({ type: 'dish', dish })
          claimed.add(dish.id)
        }
      }
    }

    // Add dishes without a category OR not claimed above
    for (const dish of optimisticDishes) {
      if (!claimed.has(dish.id) && dish.category_id == null) {
        groups.push({ type: 'dish', dish })
      }
    }

    return groups
  }, [optimisticDishes, subcategories, selectedCategory])

  if (optimisticDishes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-sm text-slate-500">
        <span>No dishes in this category.</span>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-800">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-900/50 text-left text-[10px] uppercase tracking-wider text-slate-500">
            <th className="px-2 py-2.5" style={{ width: 28 }}></th>
            <th className="px-3 py-2.5">Name</th>
            <th className="px-3 py-2.5">Description</th>
            <th className="px-3 py-2.5">Category</th>
            <th className="px-3 py-2.5 text-right">Portion</th>
            <th className="px-3 py-2.5 text-right">Price</th>
            <th className="px-3 py-2.5 text-right">&#x0E3F;/100g</th>
            <th className="px-3 py-2.5 text-right">Cost</th>
            <th className="px-3 py-2.5 text-right">Food Cost %</th>
            <th className="px-3 py-2.5 text-right">Margin</th>
            <th className="px-3 py-2.5 text-center">Available</th>
            <th className="px-3 py-2.5 text-center">Featured</th>
          </tr>
        </thead>
        <tbody>
          {groupedDishes.map((item) => {
            if (item.type === 'l2-header') {
              return (
                <tr key={`l2-${item.subcategory.id}`} className="bg-slate-900/30">
                  <td colSpan={12} className="px-3 py-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      {item.subcategory.name}
                    </span>
                  </td>
                </tr>
              )
            }

            const dish = item.dish
            const isEditing = editing?.id === dish.id
            const cost = dish.cost_per_unit
            const price = dish.price ?? 0
            const hasCost = cost != null
            const foodCostPct = hasCost && price > 0 ? (cost / price) * 100 : 0
            const margin = hasCost ? price - cost : 0

            const isExpanded = expandedId === dish.id

            return (
              <Fragment key={dish.id}>
              <tr
                data-dish-row={dish.id}
                className={`border-b border-slate-800/50 transition ${
                  isExpanded ? 'bg-slate-800/40' : 'hover:bg-slate-800/30'
                }`}
              >
                {/* Expand toggle */}
                <td className="px-2 py-2">
                  <button
                    onClick={() => toggleExpand(dish.id)}
                    className="rounded p-1 text-slate-500 transition hover:bg-slate-700 hover:text-slate-200"
                    title={isExpanded ? 'Collapse' : 'Expand tech card'}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </button>
                </td>

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
                    <span className="flex items-center">
                      <button
                        onClick={() => startEdit(dish)}
                        className="text-left font-medium text-slate-100"
                      >
                        {dish.name}
                      </button>
                      {!hasNutrition(dish) && (
                        <span className="ml-2 inline-flex rounded-full bg-slate-700 px-1.5 py-0.5 text-[9px] font-medium text-slate-400">
                          No KBJU
                        </span>
                      )}
                    </span>
                  )}
                </td>

                {/* Description */}
                <td className="max-w-[200px] px-3 py-2 text-slate-400">
                  {dish.description ? (
                    <span title={dish.description} className="block truncate">
                      {dish.description.length > 40
                        ? dish.description.slice(0, 40) + '...'
                        : dish.description}
                    </span>
                  ) : (
                    <span className="text-slate-600">-</span>
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

                {/* Portion */}
                <td className="px-3 py-2 text-right">
                  {portionEditing?.id === dish.id ? (
                    <div className="flex items-center justify-end gap-1">
                      <input
                        value={portionEditing.size}
                        onChange={(e) => setPortionEditing({ ...portionEditing, size: e.target.value })}
                        onKeyDown={handlePortionKeyDown}
                        className="w-16 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-right text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
                        type="number"
                        min={0}
                        autoFocus
                      />
                      <select
                        value={portionEditing.unit}
                        onChange={(e) => setPortionEditing({ ...portionEditing, unit: e.target.value as PortionUnit })}
                        className="rounded border border-slate-600 bg-slate-800 px-1 py-1 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
                      >
                        <option value="g">g</option>
                        <option value="ml">ml</option>
                        <option value="pcs">pcs</option>
                      </select>
                      <button onClick={savePortionEdit} className="rounded bg-emerald-600 p-0.5 text-white hover:bg-emerald-500">
                        <Check className="h-3 w-3" />
                      </button>
                      <button onClick={cancelPortionEdit} className="rounded bg-slate-700 p-0.5 text-slate-300 hover:bg-slate-600">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startPortionEdit(dish)}
                      className={`text-right ${dish.portion_size != null ? 'text-slate-300' : 'text-slate-600'}`}
                      title="Edit portion size"
                    >
                      {formatPortion(dish)}
                    </button>
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

                {/* ฿/100g */}
                <td className="px-3 py-2 text-right">
                  {(() => {
                    const per100 = pricePer100(dish.price, dish.portion_size, dish.portion_unit)
                    return per100 != null ? (
                      <span className="text-slate-400">{formatThb(Math.round(per100))}</span>
                    ) : (
                      <span className="text-slate-600">&mdash;</span>
                    )
                  })()}
                </td>

                {/* Cost */}
                <td className="px-3 py-2 text-right">
                  {hasCost ? (
                    <span className="text-slate-400">{formatThb(cost)}</span>
                  ) : (
                    <span className="inline-flex rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                      No BOM
                    </span>
                  )}
                </td>

                {/* Food Cost % */}
                <td className="px-3 py-2 text-right">
                  {hasCost && price > 0 ? (
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${foodCostColor(foodCostPct)}`}>
                      {foodCostPct.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-slate-600">&mdash;</span>
                  )}
                </td>

                {/* Margin */}
                <td className="px-3 py-2 text-right">
                  {hasCost && price > 0 ? (
                    <span className={margin > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      {formatThb(margin)}
                    </span>
                  ) : (
                    <span className="text-slate-600">&mdash;</span>
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
              {isExpanded && (
                <tr className="bg-slate-950/60">
                  <td colSpan={12} className="p-0">
                    <DishExpandedCard dish={dish} />
                  </td>
                </tr>
              )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
