import { useEffect, useMemo, useState } from 'react'
import { Loader2, Plus, Save, Search, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Dish = {
  id: string
  product_code: string
  name: string
  base_unit: string | null
  type: string
}

type Ingredient = {
  id: string
  product_code: string
  name: string
  type: string
  base_unit: string | null
}

type BomItem = {
  id: string
  parentId: string
  ingredientId: string
  quantityPerUnit: number
  yieldLossPct: number | null
  notes: string | null
  ingredient?: Ingredient
}

type NomenclatureFilter = 'sales' | 'pf' | 'mod' | 'raw'

const FILTERS: { id: NomenclatureFilter; label: string; hint: string }[] = [
  { id: 'sales', label: 'Sales (Dishes)', hint: 'SALE-* or type = dish' },
  { id: 'pf', label: 'Semi-Finished (PF)', hint: 'PF-*' },
  { id: 'mod', label: 'Modifiers (MOD)', hint: 'MOD-*' },
  { id: 'raw', label: 'Raw (RAW)', hint: 'RAW-*' },
]

// This component renders the Lego-style builder for nomenclature items and their BOM.
export function RecipeBuilder() {
  const [activeFilter, setActiveFilter] = useState<NomenclatureFilter>('sales')

  const [dishes, setDishes] = useState<Dish[]>([])
  const [dishesFilter, setDishesFilter] = useState('')
  const [isLoadingDishes, setIsLoadingDishes] = useState(false)

  const [selectedDishId, setSelectedDishId] = useState<string | null>(null)

  const [bomItems, setBomItems] = useState<BomItem[]>([])
  const [isLoadingBom, setIsLoadingBom] = useState(false)
  const [isSavingBom, setIsSavingBom] = useState(false)

  const [availableIngredients, setAvailableIngredients] = useState<Ingredient[]>(
    [],
  )
  const [isLoadingIngredients, setIsLoadingIngredients] = useState(false)

  const [newIngredientId, setNewIngredientId] = useState<string>('')

  const selectedDish = useMemo(
    () => dishes.find((d) => d.id === selectedDishId) ?? null,
    [dishes, selectedDishId],
  )

  // Load available ingredients for Add Ingredient (PF-, MOD-, RAW-)
  useEffect(() => {
    const fetchAvailableIngredients = async () => {
      setIsLoadingIngredients(true)
      const { data, error } = await supabase
        .from('nomenclature')
        .select('id, product_code, name, type, base_unit')
        .or(
          "product_code.ilike.PF-%,product_code.ilike.MOD-%,product_code.ilike.RAW-%",
        )
        .eq('is_deleted', false)
        .order('product_code', { ascending: true })

      if (error) {
        console.error('[RecipeBuilder] Failed to load ingredients', error)
      } else {
        setAvailableIngredients((data ?? []) as Ingredient[])
      }
      setIsLoadingIngredients(false)
    }

    fetchAvailableIngredients()
  }, [])

  // Load list on the left based on active filter (Sales / PF / MOD / RAW)
  useEffect(() => {
    const fetchDishes = async () => {
      setIsLoadingDishes(true)

      let query = supabase
        .from('nomenclature')
        .select('id, product_code, name, base_unit, type')
        .eq('is_deleted', false)
        .order('product_code', { ascending: true })

      switch (activeFilter) {
        case 'sales':
          // Sales dishes: explicit SALE-* plus any remaining type='dish'
          query = query.or('product_code.ilike.SALE-%,type.eq.dish')
          break
        case 'pf':
          query = query.ilike('product_code', 'PF-%')
          break
        case 'mod':
          query = query.ilike('product_code', 'MOD-%')
          break
        case 'raw':
          query = query.ilike('product_code', 'RAW-%')
          break
      }

      const { data, error } = await query

      if (error) {
        console.error('[RecipeBuilder] Failed to load items for filter', {
          activeFilter,
          error,
        })
      } else {
        setDishes((data ?? []) as Dish[])
      }

      setIsLoadingDishes(false)
    }

    // Reset selection when switching filter to avoid dangling parent_id
    setSelectedDishId(null)
    setBomItems([])
    fetchDishes()
  }, [activeFilter])

  // Load BOM for selected item (any type) from bom_structures
  useEffect(() => {
    const fetchBom = async () => {
      if (!selectedDishId) {
        setBomItems([])
        return
      }

      setIsLoadingBom(true)

      const { data: bomRows, error: bomError } = await supabase
        .from('bom_structures')
        .select(
          'id, parent_id, ingredient_id, quantity_per_unit, yield_loss_pct, notes',
        )
        .eq('parent_id', selectedDishId)
        .order('created_at', { ascending: true })

      if (bomError) {
        console.error('[RecipeBuilder] Failed to load BOM', bomError)
        setIsLoadingBom(false)
        return
      }

      const ingredientIds = Array.from(
        new Set((bomRows ?? []).map((row) => row.ingredient_id as string)),
      )

      let ingredientsById: Record<string, Ingredient> = {}

      if (ingredientIds.length > 0) {
        const { data: ingredientRows, error: ingredientError } = await supabase
          .from('nomenclature')
          .select('id, product_code, name, type, base_unit')
          .in('id', ingredientIds)

        if (ingredientError) {
          console.error(
            '[RecipeBuilder] Failed to load ingredient details',
            ingredientError,
          )
        } else {
          ingredientsById = Object.fromEntries(
            (ingredientRows ?? []).map((row) => [
              row.id as string,
              row as Ingredient,
            ]),
          )
        }
      }

      const mappedBom: BomItem[] =
        bomRows?.map((row) => ({
          id: row.id as string,
          parentId: row.parent_id as string,
          ingredientId: row.ingredient_id as string,
          quantityPerUnit: Number(row.quantity_per_unit ?? 0),
          yieldLossPct:
            row.yield_loss_pct === null
              ? null
              : Number(row.yield_loss_pct as number),
          notes: (row.notes as string | null) ?? null,
          ingredient: ingredientsById[row.ingredient_id as string],
        })) ?? []

      setBomItems(mappedBom)
      setIsLoadingBom(false)
    }

    fetchBom()
  }, [selectedDishId])

  const filteredDishes = useMemo(() => {
    const term = dishesFilter.trim().toLowerCase()
    if (!term) return dishes

    return dishes.filter(
      (dish) =>
        dish.product_code.toLowerCase().includes(term) ||
        dish.name.toLowerCase().includes(term),
    )
  }, [dishes, dishesFilter])

  const handleQuantityChange = (id: string, value: string) => {
    const numeric = Number(value)
    if (Number.isNaN(numeric)) return

    setBomItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, quantityPerUnit: numeric } : item,
      ),
    )
  }

  const handleAddIngredient = () => {
    if (!selectedDishId || !newIngredientId) return

    const ingredient = availableIngredients.find((i) => i.id === newIngredientId)
    if (!ingredient) return

    const tempId = `local-${crypto.randomUUID()}`

    const newItem: BomItem = {
      id: tempId,
      parentId: selectedDishId,
      ingredientId: ingredient.id,
      quantityPerUnit: 0,
      yieldLossPct: null,
      notes: null,
      ingredient,
    }

    setBomItems((prev) => [...prev, newItem])
    setNewIngredientId('')
  }

  const handleRemoveItem = (id: string) => {
    setBomItems((prev) => prev.filter((item) => item.id !== id))
  }

  const handleSaveBom = async () => {
    if (!selectedDishId) return

    try {
      setIsSavingBom(true)

      console.log(
        '[RecipeBuilder] Saving BOM for parent_id (UUID):',
        selectedDishId,
      )

      const { error: deleteError } = await supabase
        .from('bom_structures')
        .delete()
        .eq('parent_id', selectedDishId)

      if (deleteError) {
        console.error('[RecipeBuilder] Failed to delete existing BOM', deleteError)
        alert('Failed to delete existing BOM rows. See console for details.')
        setIsSavingBom(false)
        return
      }

      if (bomItems.length > 0) {
        const payload = bomItems.map((item) => ({
          parent_id: selectedDishId,
          ingredient_id: item.ingredientId,
          quantity_per_unit: item.quantityPerUnit,
          yield_loss_pct: item.yieldLossPct,
          notes: item.notes,
        }))

        const { error: insertError } = await supabase
          .from('bom_structures')
          .insert(payload)

        if (insertError) {
          console.error('[RecipeBuilder] Failed to insert BOM', insertError)
          alert('Failed to insert new BOM rows. See console for details.')
          setIsSavingBom(false)
          return
        }
      }

      alert('BOM saved successfully for current item.')
      console.log(
        '[RecipeBuilder] BOM saved successfully for parent_id:',
        selectedDishId,
      )
    } finally {
      setIsSavingBom(false)
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,0.45fr)_minmax(0,0.55fr)]">
      {/* Left: Nomenclature levels (Sales / PF / MOD / RAW) */}
      <section className="flex min-h-[480px] flex-col rounded-xl border border-slate-800 bg-slate-900/50 shadow-sm">
        <header className="border-b border-slate-800 px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                Nomenclature Levels
              </h2>
              <p className="text-xs text-slate-500">
                Pick a node (SALE / PF / MOD / RAW) to edit its Lego.
              </p>
            </div>
          </div>
          <div className="mt-3 flex gap-1 overflow-x-auto text-xs">
            {FILTERS.map((filter) => {
              const isActive = filter.id === activeFilter
              return (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setActiveFilter(filter.id)}
                  className={[
                    'inline-flex items-center rounded-full border px-3 py-1 transition',
                    isActive
                      ? 'border-emerald-500/80 bg-emerald-500/15 text-emerald-100'
                      : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500 hover:bg-slate-800',
                  ].join(' ')}
                >
                  {filter.label}
                </button>
              )
            })}
          </div>
        </header>

        <div className="border-b border-slate-800 px-4 py-3">
          <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100">
            <Search className="h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={dishesFilter}
              onChange={(e) => setDishesFilter(e.target.value)}
              placeholder="Filter by product code or name..."
              className="h-7 w-full bg-transparent text-xs outline-none placeholder:text-slate-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2 pt-1">
          {isLoadingDishes ? (
            <div className="flex h-full items-center justify-center text-xs text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading items from nomenclature...
            </div>
          ) : filteredDishes.length === 0 ? (
            <p className="px-2 py-2 text-xs text-slate-500">
              No items found for this filter. Check nomenclature or filters.
            </p>
          ) : (
            <ul className="space-y-1">
              {filteredDishes.map((dish) => {
                const isSelected = dish.id === selectedDishId
                return (
                  <li key={dish.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedDishId(dish.id)}
                      className={[
                        'flex w-full flex-col items-start rounded-lg border px-3 py-2 text-left text-xs transition',
                        isSelected
                          ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-50'
                          : 'border-transparent bg-slate-900/60 text-slate-100 hover:border-slate-700 hover:bg-slate-900',
                      ].join(' ')}
                    >
                      <span className="font-mono text-[11px] uppercase tracking-wide">
                        {dish.product_code}
                      </span>
                      <span className="mt-0.5 text-[11px] text-slate-400">
                        {dish.name}
                      </span>
                      <span className="mt-0.5 text-[10px] text-slate-500">
                        base_unit: {dish.base_unit ?? '—'}
                      </span>
                      <span className="mt-1 text-[10px] text-slate-500">
                        id: {dish.id}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Right: BOM Specification */}
      <section className="flex min-h-[480px] flex-col rounded-xl border border-slate-800 bg-slate-900/50 shadow-sm">
        <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              BOM Specification
            </h2>
            <p className="text-xs text-slate-500">
              Strictly using UUIDs in state; codes/names/UoM are for human eyes.
            </p>
          </div>
        </header>

        {!selectedDish ? (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-slate-500">
            Select a node on the left to inspect or edit its Lego.
          </div>
        ) : (
          <>
            <div className="border-b border-slate-800 px-4 py-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-mono text-[11px] uppercase tracking-wide text-emerald-300">
                    {selectedDish.product_code}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {selectedDish.name}
                  </div>
                  <div className="mt-1 text-[10px] text-slate-500">
                    parent_id (UUID): {selectedDish.id}
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-500">
                    base_unit: {selectedDish.base_unit ?? '—'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSaveBom}
                  disabled={isSavingBom}
                  className="inline-flex h-8 items-center justify-center rounded-md border border-emerald-500/60 bg-emerald-500/10 px-3 text-[11px] font-medium text-emerald-200 hover:bg-emerald-500/20 disabled:border-slate-700 disabled:bg-slate-900 disabled:text-slate-500"
                >
                  {isSavingBom ? (
                    <>
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-1 h-3 w-3" />
                      Save BOM
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3 text-xs">
              <div className="flex-1">
                <label className="mb-1 block text-[11px] text-slate-400">
                  Add Ingredient (PF- / MOD- / RAW-)
                </label>
                <select
                  className="h-8 w-full rounded-md border border-slate-700 bg-slate-900 px-2 text-[11px] text-slate-100 outline-none"
                  value={newIngredientId}
                  onChange={(e) => setNewIngredientId(e.target.value)}
                  disabled={isLoadingIngredients}
                >
                  <option value="">Select ingredient by code...</option>
                  {availableIngredients.map((ingredient) => (
                    <option key={ingredient.id} value={ingredient.id}>
                      {ingredient.product_code} — {ingredient.name}
                      {ingredient.base_unit ? ` [${ingredient.base_unit}]` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={handleAddIngredient}
                disabled={!newIngredientId}
                className="mt-5 inline-flex h-8 items-center justify-center rounded-md border border-emerald-500/60 bg-emerald-500/10 px-3 text-[11px] font-medium text-emerald-200 hover:bg-emerald-500/20 disabled:border-slate-700 disabled:bg-slate-900 disabled:text-slate-500"
              >
                <Plus className="mr-1 h-3 w-3" />
                Add Ingredient
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 text-xs">
              {isLoadingBom ? (
                <div className="flex h-full items-center justify-center text-xs text-slate-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading BOM from bom_structures...
                </div>
              ) : bomItems.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No ingredients linked yet. Use &quot;Add Ingredient&quot; to
                  start composing this node.
                </p>
              ) : (
                <table className="w-full border-collapse text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wide text-slate-500">
                      <th className="py-1 pr-2">Ingredient</th>
                      <th className="py-1 pr-2 text-right">Qty / Unit</th>
                      <th className="py-1 pr-2 text-right">Yield %</th>
                      <th className="py-1 pr-2">Notes</th>
                      <th className="py-1 pl-2 pr-0 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bomItems.map((item) => (
                      <tr key={item.id} className="border-b border-slate-900">
                        <td className="py-1 pr-2 align-top">
                          <div className="font-mono text-[11px]">
                            {item.ingredient?.product_code ?? 'UNKNOWN'}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {item.ingredient?.name ?? 'Missing nomenclature row'}
                          </div>
                          <div className="mt-1 text-[10px] text-slate-500">
                            ingredient_id: {item.ingredientId}
                          </div>
                        </td>
                        <td className="py-1 pr-2 align-top text-right">
                          <div className="flex items-center justify-end gap-1">
                            <input
                              type="number"
                              step="0.001"
                              value={item.quantityPerUnit}
                              onChange={(e) =>
                                handleQuantityChange(item.id, e.target.value)
                              }
                              className="h-7 w-20 rounded-md border border-slate-700 bg-slate-900 px-1 text-right text-[11px] text-slate-100 outline-none"
                            />
                            <span className="min-w-[2.5rem] text-left text-[10px] text-slate-500">
                              {item.ingredient?.base_unit ?? ''}
                            </span>
                          </div>
                        </td>
                        <td className="py-1 pr-2 align-top text-right">
                          <span className="inline-block min-w-[3rem] text-right">
                            {item.yieldLossPct ?? '—'}
                          </span>
                        </td>
                        <td className="py-1 pr-2 align-top">
                          <span className="block max-w-[220px] truncate text-[11px] text-slate-400">
                            {item.notes ?? '—'}
                          </span>
                        </td>
                        <td className="py-1 pl-2 pr-0 align-top text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-slate-400 hover:border-red-500/60 hover:bg-red-500/10 hover:text-red-300"
                            aria-label="Remove ingredient from BOM"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  )
}