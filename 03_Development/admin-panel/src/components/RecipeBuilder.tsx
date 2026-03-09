import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Calculator,
  Edit3,
  Loader2,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

// ─── Types ────────────────────────────────────────────────────

type NomItem = {
  id: string
  product_code: string
  name: string
  base_unit: string | null
  type: string
  cost_per_unit: number
  notes: string | null
}

type Ingredient = {
  id: string
  product_code: string
  name: string
  type: string
  base_unit: string | null
  cost_per_unit: number
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

const FILTERS: { id: NomenclatureFilter; label: string; prefix: string }[] = [
  { id: 'sales', label: 'Sales (Dishes)', prefix: 'SALE' },
  { id: 'pf', label: 'Semi-Finished (PF)', prefix: 'PF' },
  { id: 'mod', label: 'Modifiers (MOD)', prefix: 'MOD' },
  { id: 'raw', label: 'Raw (RAW)', prefix: 'RAW' },
]

const TYPE_OPTIONS = [
  { value: 'dish', label: 'Dish (SALE)' },
  { value: 'semi', label: 'Semi-Finished (PF)' },
  { value: 'modifier', label: 'Modifier (MOD)' },
  { value: 'raw', label: 'Raw Material' },
]

const UNIT_OPTIONS = ['kg', 'g', 'L', 'ml', 'pcs', 'portion']

// ─── Modal Component ──────────────────────────────────────────

function NomenclatureModal({
  item,
  onClose,
  onSaved,
  activePrefix,
}: {
  item: NomItem | null // null = create mode
  onClose: () => void
  onSaved: () => void
  activePrefix: string
}) {
  const isEdit = item !== null

  const [name, setName] = useState(item?.name ?? '')
  const [productCode, setProductCode] = useState(
    item?.product_code ?? `${activePrefix}-`,
  )
  const [type, setType] = useState(
    item?.type ??
      (activePrefix === 'SALE'
        ? 'dish'
        : activePrefix === 'PF'
          ? 'semi'
          : activePrefix === 'MOD'
            ? 'modifier'
            : 'raw'),
  )
  const [baseUnit, setBaseUnit] = useState(item?.base_unit ?? 'kg')
  const [costPerUnit, setCostPerUnit] = useState(item?.cost_per_unit ?? 0)
  const [notes, setNotes] = useState(item?.notes ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    if (!productCode.trim()) {
      setError('Product code is required')
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      if (isEdit) {
        const { error: updateError } = await supabase
          .from('nomenclature')
          .update({
            name: name.trim(),
            product_code: productCode.trim().toUpperCase(),
            type,
            base_unit: baseUnit,
            cost_per_unit: costPerUnit,
            notes: notes.trim() || null,
          })
          .eq('id', item.id)

        if (updateError) throw updateError
      } else {
        const { error: insertError } = await supabase
          .from('nomenclature')
          .insert({
            name: name.trim(),
            product_code: productCode.trim().toUpperCase(),
            type,
            base_unit: baseUnit,
            cost_per_unit: costPerUnit,
            notes: notes.trim() || null,
          })

        if (insertError) throw insertError
      }

      onSaved()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-100">
            {isEdit ? 'Edit Item' : 'Create New Item'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Product Code
            </label>
            <input
              type="text"
              value={productCode}
              onChange={(e) => setProductCode(e.target.value.toUpperCase())}
              placeholder="e.g. SALE-BUDDHA_BOWL"
              className="h-9 w-full rounded-md border border-slate-700 bg-slate-800 px-3 text-xs text-slate-100 outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Buddha Bowl"
              className="h-9 w-full rounded-md border border-slate-700 bg-slate-800 px-3 text-xs text-slate-100 outline-none focus:border-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-slate-400">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="h-9 w-full rounded-md border border-slate-700 bg-slate-800 px-2 text-xs text-slate-100 outline-none"
              >
                {TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Unit</label>
              <select
                value={baseUnit}
                onChange={(e) => setBaseUnit(e.target.value)}
                className="h-9 w-full rounded-md border border-slate-700 bg-slate-800 px-2 text-xs text-slate-100 outline-none"
              >
                {UNIT_OPTIONS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Cost per Unit (THB)
            </label>
            <input
              type="number"
              step="0.01"
              value={costPerUnit}
              onChange={(e) => setCostPerUnit(Number(e.target.value))}
              className="h-9 w-full rounded-md border border-slate-700 bg-slate-800 px-3 text-xs text-slate-100 outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional notes..."
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-800 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded-md border border-slate-700 bg-slate-800 px-4 text-xs text-slate-300 hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex h-8 items-center rounded-md border border-emerald-500/60 bg-emerald-500/15 px-4 text-xs font-medium text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Save className="mr-1 h-3 w-3" />
            )}
            {isEdit ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Cost Calculator ──────────────────────────────────────────

function CostBadge({
  bomItems,
  ingredientCosts,
}: {
  bomItems: BomItem[]
  ingredientCosts: Record<string, number>
}) {
  const totalCost = useMemo(() => {
    return bomItems.reduce((sum, item) => {
      const unitCost = ingredientCosts[item.ingredientId] ?? 0
      return sum + unitCost * item.quantityPerUnit
    }, 0)
  }, [bomItems, ingredientCosts])

  if (bomItems.length === 0) return null

  return (
    <div className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5">
      <Calculator className="h-3.5 w-3.5 text-amber-400" />
      <span className="text-xs font-medium text-amber-200">
        Cost: {totalCost > 0 ? `${totalCost.toFixed(2)} THB` : '—'}
      </span>
    </div>
  )
}

// ─── Main RecipeBuilder ───────────────────────────────────────

export function RecipeBuilder() {
  const [activeFilter, setActiveFilter] = useState<NomenclatureFilter>('sales')

  const [dishes, setDishes] = useState<NomItem[]>([])
  const [dishesFilter, setDishesFilter] = useState('')
  const [isLoadingDishes, setIsLoadingDishes] = useState(false)

  const [selectedDishId, setSelectedDishId] = useState<string | null>(null)

  const [bomItems, setBomItems] = useState<BomItem[]>([])
  const [isLoadingBom, setIsLoadingBom] = useState(false)
  const [isSavingBom, setIsSavingBom] = useState(false)

  const [availableIngredients, setAvailableIngredients] = useState<
    Ingredient[]
  >([])
  const [isLoadingIngredients, setIsLoadingIngredients] = useState(false)
  const [ingredientCosts, setIngredientCosts] = useState<
    Record<string, number>
  >({})

  const [newIngredientId, setNewIngredientId] = useState<string>('')

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState<NomItem | null>(null)

  const activePrefix =
    FILTERS.find((f) => f.id === activeFilter)?.prefix ?? 'SALE'

  const selectedDish = useMemo(
    () => dishes.find((d) => d.id === selectedDishId) ?? null,
    [dishes, selectedDishId],
  )

  // Fetch items for left panel
  const fetchDishes = useCallback(async () => {
    setIsLoadingDishes(true)

    // BORIS RULE #8: Filter STRICTLY by product_code prefix only
    const prefix = FILTERS.find((f) => f.id === activeFilter)?.prefix ?? 'SALE'

    const { data, error } = await supabase
      .from('nomenclature')
      .select('id, product_code, name, base_unit, type, cost_per_unit, notes')
      .ilike('product_code', `${prefix}-%`)
      .eq('is_deleted', false)
      .order('product_code', { ascending: true })

    if (error) {
      console.error('[RecipeBuilder] Failed to load items', {
        activeFilter,
        error,
      })
    } else {
      setDishes(
        (data ?? []).map((d) => ({
          ...d,
          cost_per_unit: Number(d.cost_per_unit ?? 0),
        })) as NomItem[],
      )
    }

    setIsLoadingDishes(false)
  }, [activeFilter])

  useEffect(() => {
    setSelectedDishId(null)
    setBomItems([])
    fetchDishes()
  }, [fetchDishes])

  // Load available ingredients for the Add Ingredient dropdown
  useEffect(() => {
    const fetchIngredients = async () => {
      setIsLoadingIngredients(true)
      const { data, error } = await supabase
        .from('nomenclature')
        .select('id, product_code, name, type, base_unit, cost_per_unit')
        .or(
          'product_code.ilike.PF-%,product_code.ilike.MOD-%,product_code.ilike.RAW-%',
        )
        .eq('is_deleted', false)
        .order('product_code', { ascending: true })

      if (error) {
        console.error('[RecipeBuilder] Failed to load ingredients', error)
      } else {
        const rows = (data ?? []).map((d) => ({
          ...d,
          cost_per_unit: Number(d.cost_per_unit ?? 0),
        })) as Ingredient[]
        setAvailableIngredients(rows)

        // Build cost lookup map
        const costs: Record<string, number> = {}
        for (const row of rows) {
          costs[row.id] = row.cost_per_unit
        }
        setIngredientCosts(costs)
      }
      setIsLoadingIngredients(false)
    }

    fetchIngredients()
  }, [])

  // Load BOM for selected item
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
          .select('id, product_code, name, type, base_unit, cost_per_unit')
          .in('id', ingredientIds)

        if (ingredientError) {
          console.error('[RecipeBuilder] Failed to load ingredient details', ingredientError)
        } else {
          ingredientsById = Object.fromEntries(
            (ingredientRows ?? []).map((row) => [
              row.id as string,
              { ...row, cost_per_unit: Number(row.cost_per_unit ?? 0) } as Ingredient,
            ]),
          )
          // Update cost map with these ingredients too
          setIngredientCosts((prev) => {
            const next = { ...prev }
            for (const [id, ing] of Object.entries(ingredientsById)) {
              next[id] = ing.cost_per_unit
            }
            return next
          })
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

  const handleYieldChange = (id: string, value: string) => {
    const numeric = value === '' ? null : Number(value)
    if (numeric !== null && Number.isNaN(numeric)) return
    setBomItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, yieldLossPct: numeric } : item,
      ),
    )
  }

  const handleNoteChange = (id: string, value: string) => {
    setBomItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, notes: value || null } : item,
      ),
    )
  }

  const handleAddIngredient = () => {
    if (!selectedDishId || !newIngredientId) return
    const ingredient = availableIngredients.find(
      (i) => i.id === newIngredientId,
    )
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

      const { error: deleteError } = await supabase
        .from('bom_structures')
        .delete()
        .eq('parent_id', selectedDishId)

      if (deleteError) {
        console.error('[RecipeBuilder] Delete error', deleteError)
        alert('Failed to delete existing BOM rows.')
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
          console.error('[RecipeBuilder] Insert error', insertError)
          alert('Failed to insert new BOM rows.')
          setIsSavingBom(false)
          return
        }
      }

      alert('BOM saved successfully!')
    } finally {
      setIsSavingBom(false)
    }
  }

  const handleOpenCreate = () => {
    setEditingItem(null)
    setShowModal(true)
  }

  const handleOpenEdit = () => {
    if (selectedDish) {
      setEditingItem(selectedDish)
      setShowModal(true)
    }
  }

  const handleModalSaved = () => {
    fetchDishes()
  }

  // ─── Render ───────────────────────────────────────────────────

  return (
    <>
      <div className="grid gap-6 md:grid-cols-[minmax(0,0.45fr)_minmax(0,0.55fr)]">
        {/* Left: Nomenclature levels */}
        <section className="flex min-h-[480px] flex-col rounded-xl border border-slate-800 bg-slate-900/50 shadow-sm">
          <header className="border-b border-slate-800 px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">
                  Nomenclature Levels
                </h2>
                <p className="text-xs text-slate-500">
                  Pick a node to edit its BOM, or create a new item.
                </p>
              </div>
              <button
                type="button"
                onClick={handleOpenCreate}
                className="inline-flex h-8 items-center rounded-md border border-emerald-500/60 bg-emerald-500/10 px-3 text-[11px] font-medium text-emerald-200 hover:bg-emerald-500/20"
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add Item
              </button>
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
                Loading items...
              </div>
            ) : filteredDishes.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-slate-500">
                <p>No items found.</p>
                <button
                  type="button"
                  onClick={handleOpenCreate}
                  className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1.5 text-slate-400 hover:border-emerald-500/50 hover:text-emerald-300"
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Create first {activePrefix} item
                </button>
              </div>
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
                        <div className="flex w-full items-center justify-between">
                          <span className="font-mono text-[11px] uppercase tracking-wide">
                            {dish.product_code}
                          </span>
                          {dish.cost_per_unit > 0 && (
                            <span className="text-[10px] text-amber-400">
                              {dish.cost_per_unit.toFixed(0)} THB
                            </span>
                          )}
                        </div>
                        <span className="mt-0.5 text-[11px] text-slate-400">
                          {dish.name}
                        </span>
                        <span className="mt-0.5 text-[10px] text-slate-500">
                          {dish.base_unit ?? '—'}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-slate-800 px-4 py-2 text-[10px] text-slate-500">
            {filteredDishes.length} items
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
                Edit ingredients, quantities, and cost breakdown.
              </p>
            </div>
          </header>

          {!selectedDish ? (
            <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-slate-500">
              Select a node on the left to inspect or edit its BOM.
            </div>
          ) : (
            <>
              {/* Selected item header */}
              <div className="border-b border-slate-800 px-4 py-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] uppercase tracking-wide text-emerald-300">
                        {selectedDish.product_code}
                      </span>
                      <button
                        type="button"
                        onClick={handleOpenEdit}
                        className="inline-flex h-5 items-center rounded border border-slate-700 px-1.5 text-[10px] text-slate-400 hover:border-emerald-500/50 hover:text-emerald-300"
                      >
                        <Edit3 className="mr-0.5 h-2.5 w-2.5" />
                        Edit
                      </button>
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      {selectedDish.name}
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-[10px] text-slate-500">
                      <span>Unit: {selectedDish.base_unit ?? '—'}</span>
                      {selectedDish.notes && (
                        <span className="italic">{selectedDish.notes}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <CostBadge
                      bomItems={bomItems}
                      ingredientCosts={ingredientCosts}
                    />
                    <button
                      type="button"
                      onClick={handleSaveBom}
                      disabled={isSavingBom}
                      className="inline-flex h-8 items-center justify-center rounded-md border border-emerald-500/60 bg-emerald-500/10 px-3 text-[11px] font-medium text-emerald-200 hover:bg-emerald-500/20 disabled:border-slate-700 disabled:bg-slate-900 disabled:text-slate-500"
                    >
                      {isSavingBom ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <Save className="mr-1 h-3 w-3" />
                      )}
                      Save BOM
                    </button>
                  </div>
                </div>
              </div>

              {/* Add ingredient row */}
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
                        {ingredient.base_unit
                          ? ` [${ingredient.base_unit}]`
                          : ''}
                        {ingredient.cost_per_unit > 0
                          ? ` (${ingredient.cost_per_unit} THB)`
                          : ''}
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
                  Add
                </button>
              </div>

              {/* BOM table */}
              <div className="flex-1 overflow-y-auto px-4 py-3 text-xs">
                {isLoadingBom ? (
                  <div className="flex h-full items-center justify-center text-xs text-slate-500">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading BOM...
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
                        <th className="py-1 pr-2 text-right">Qty</th>
                        <th className="py-1 pr-1 text-right">Yield%</th>
                        <th className="py-1 pr-1 text-right">Cost</th>
                        <th className="py-1 pr-2">Notes</th>
                        <th className="py-1 pl-1 pr-0 text-right" />
                      </tr>
                    </thead>
                    <tbody>
                      {bomItems.map((item) => {
                        const unitCost =
                          ingredientCosts[item.ingredientId] ?? 0
                        const lineCost = unitCost * item.quantityPerUnit
                        return (
                          <tr
                            key={item.id}
                            className="border-b border-slate-900"
                          >
                            <td className="py-1.5 pr-2 align-top">
                              <div className="font-mono text-[11px]">
                                {item.ingredient?.product_code ?? 'UNKNOWN'}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {item.ingredient?.name ?? 'Missing'}
                              </div>
                            </td>
                            <td className="py-1.5 pr-2 align-top text-right">
                              <div className="flex items-center justify-end gap-1">
                                <input
                                  type="number"
                                  step="0.001"
                                  value={item.quantityPerUnit}
                                  onChange={(e) =>
                                    handleQuantityChange(
                                      item.id,
                                      e.target.value,
                                    )
                                  }
                                  className="h-7 w-16 rounded-md border border-slate-700 bg-slate-900 px-1 text-right text-[11px] text-slate-100 outline-none"
                                />
                                <span className="min-w-[2rem] text-left text-[10px] text-slate-500">
                                  {item.ingredient?.base_unit ?? ''}
                                </span>
                              </div>
                            </td>
                            <td className="py-1.5 pr-1 align-top text-right">
                              <input
                                type="number"
                                step="0.1"
                                value={item.yieldLossPct ?? ''}
                                onChange={(e) =>
                                  handleYieldChange(item.id, e.target.value)
                                }
                                placeholder="—"
                                className="h-7 w-14 rounded-md border border-slate-700 bg-slate-900 px-1 text-right text-[11px] text-slate-100 outline-none placeholder:text-slate-600"
                              />
                            </td>
                            <td className="py-1.5 pr-1 align-top text-right">
                              <span
                                className={`text-[11px] ${lineCost > 0 ? 'text-amber-300' : 'text-slate-600'}`}
                              >
                                {lineCost > 0
                                  ? `${lineCost.toFixed(2)}`
                                  : '—'}
                              </span>
                            </td>
                            <td className="py-1.5 pr-2 align-top">
                              <input
                                type="text"
                                value={item.notes ?? ''}
                                onChange={(e) =>
                                  handleNoteChange(item.id, e.target.value)
                                }
                                placeholder="—"
                                className="h-7 w-full max-w-[140px] rounded-md border border-slate-700 bg-slate-900 px-1 text-[11px] text-slate-100 outline-none placeholder:text-slate-600"
                              />
                            </td>
                            <td className="py-1.5 pl-1 pr-0 align-top text-right">
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(item.id)}
                                className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-slate-400 hover:border-red-500/60 hover:bg-red-500/10 hover:text-red-300"
                                aria-label="Remove ingredient"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <NomenclatureModal
          item={editingItem}
          onClose={() => setShowModal(false)}
          onSaved={handleModalSaved}
          activePrefix={activePrefix}
        />
      )}
    </>
  )
}
