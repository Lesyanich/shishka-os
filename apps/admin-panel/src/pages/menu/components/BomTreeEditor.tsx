import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Loader2, Plus, Search, Trash2, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import type { DishBomRow, DishIngredient } from '../../../hooks/useDishDetail'

export interface BomTreeEditorProps {
  dishId: string
  bom: DishBomRow[]
  totalBomCost: number
  isLoading: boolean
  error: string | null
  onAdd: (ingredientId: string, quantity: number) => Promise<{ ok: boolean; error?: string }>
  onUpdate: (
    rowId: string,
    patch: Partial<Pick<DishBomRow, 'quantity_per_unit' | 'yield_loss_pct' | 'notes'>>,
  ) => Promise<{ ok: boolean; error?: string }>
  onRemove: (rowId: string) => Promise<{ ok: boolean; error?: string }>
}

function formatThb(v: number): string {
  return `\u0E3F${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function typeBadge(type: string, productCode: string): { label: string; color: string } {
  if (type === 'semi' || productCode.startsWith('PF-')) {
    return { label: 'PF', color: 'bg-nutri-car/20 text-nutri-car' }
  }
  if (type === 'modifier' || productCode.startsWith('MOD-')) {
    return { label: 'MOD', color: 'bg-amber-watch/20 text-amber-watch' }
  }
  return { label: 'RAW', color: 'bg-surface-3 text-cream/80' }
}

export function BomTreeEditor({
  dishId,
  bom,
  totalBomCost,
  isLoading,
  error,
  onAdd,
  onUpdate,
  onRemove,
}: BomTreeEditorProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editQty, setEditQty] = useState<string>('')
  const [editNotes, setEditNotes] = useState<string>('')
  const [isAdding, setIsAdding] = useState(false)

  const startEdit = (row: DishBomRow) => {
    setEditingId(row.id)
    setEditQty(row.quantity_per_unit.toString())
    setEditNotes(row.notes ?? '')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditQty('')
    setEditNotes('')
  }

  const saveEdit = async () => {
    if (!editingId) return
    const qty = Number(editQty)
    if (Number.isNaN(qty) || qty < 0) {
      cancelEdit()
      return
    }
    await onUpdate(editingId, {
      quantity_per_unit: qty,
      notes: editNotes.trim() || null,
    })
    cancelEdit()
  }

  const handleRemove = async (row: DishBomRow) => {
    const name = row.ingredient?.name ?? 'ingredient'
    if (!confirm(`Remove ${name} from BOM?`)) return
    await onRemove(row.id)
  }

  const handleAdd = async (ingredientId: string, quantity: number) => {
    await onAdd(ingredientId, quantity)
    setIsAdding(false)
  }

  const excludeIds = useMemo(
    () => new Set([dishId, ...bom.map((r) => r.ingredient_id)]),
    [dishId, bom],
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-xs text-cream/50">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading BOM...
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-brick-soft/40 bg-brick-soft/15 p-3 text-xs text-brick-soft">
        Failed to load BOM: {error}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {bom.length === 0 && !isAdding ? (
        <div className="rounded-lg border border-dashed border-surface-3 bg-surface-1/40 px-4 py-6 text-center">
          <p className="text-xs text-cream/50">No ingredients yet</p>
          <button
            onClick={() => setIsAdding(true)}
            className="mt-2 inline-flex items-center gap-1 rounded-md border border-forest-soft/40 bg-royal-green/25 px-3 py-1 text-xs font-medium text-forest-soft transition hover:bg-royal-green/30"
          >
            <Plus className="h-3 w-3" />
            Add first ingredient
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-surface-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-surface-3 bg-surface-1/50 text-left text-[10px] uppercase tracking-wider text-cream/50">
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Ingredient</th>
                <th className="px-3 py-2 text-right">Quantity</th>
                <th className="px-3 py-2 text-right">Cost/unit</th>
                <th className="px-3 py-2 text-right">Cost contrib.</th>
                <th className="px-3 py-2">Notes</th>
                <th className="px-3 py-2 text-right" style={{ width: '1%' }}></th>
              </tr>
            </thead>
            <tbody>
              {bom.map((row) => {
                const ing = row.ingredient
                const isEditing = editingId === row.id
                const badge = ing ? typeBadge(ing.type, ing.product_code) : { label: '?', color: 'bg-surface-3 text-cream/60' }

                return (
                  <tr key={row.id} className="border-b border-surface-3/50 last:border-b-0 hover:bg-surface-2/20">
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded px-1.5 py-0.5 text-[9px] font-bold ${badge.color}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {ing ? (
                        <div className="flex flex-col">
                          <span className="font-medium text-cream">{ing.name}</span>
                          <span className="text-[10px] text-cream/50">{ing.product_code}</span>
                        </div>
                      ) : (
                        <span className="text-brick-soft">Missing ingredient</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            step="0.001"
                            min={0}
                            value={editQty}
                            onChange={(e) => setEditQty(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEdit()
                              if (e.key === 'Escape') cancelEdit()
                            }}
                            className="w-20 rounded border border-surface-3 bg-surface-2 px-2 py-0.5 text-right text-xs text-cream focus:border-forest-soft focus:outline-none"
                            autoFocus
                          />
                          <span className="text-[10px] text-cream/50">{ing?.base_unit ?? ''}</span>
                        </div>
                      ) : (
                        <span className="tabular-nums text-cream">
                          {row.quantity_per_unit}
                          <span className="ml-1 text-[10px] text-cream/50">{ing?.base_unit ?? ''}</span>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-cream/60 tabular-nums">
                      {ing ? formatThb(ing.cost_per_unit) : '-'}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-cream tabular-nums">
                      {formatThb(row.cost_contribution)}
                    </td>
                    <td className="px-3 py-2">
                      {isEditing ? (
                        <input
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEdit()
                            if (e.key === 'Escape') cancelEdit()
                          }}
                          placeholder="Optional notes"
                          className="w-full rounded border border-surface-3 bg-surface-2 px-2 py-0.5 text-xs text-cream focus:border-forest-soft focus:outline-none"
                        />
                      ) : (
                        <span className="text-[11px] text-cream/50">{row.notes ?? ''}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {isEditing ? (
                          <>
                            <button
                              onClick={saveEdit}
                              className="rounded bg-royal-green p-1 text-white hover:bg-forest-soft"
                              title="Save"
                            >
                              <Check className="h-3 w-3" />
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="rounded bg-surface-3 p-1 text-cream/80 hover:bg-surface-3"
                              title="Cancel"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(row)}
                              className="rounded p-1 text-cream/60 hover:bg-surface-3 hover:text-cream"
                              title="Edit"
                            >
                              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleRemove(row)}
                              className="rounded p-1 text-cream/60 hover:bg-brick-soft/30 hover:text-brick-soft"
                              title="Remove"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {bom.length > 0 && (
              <tfoot>
                <tr className="border-t border-surface-3 bg-surface-1/60">
                  <td colSpan={4} className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-cream/50">
                    Total BOM cost per unit
                  </td>
                  <td className="px-3 py-2 text-right text-sm font-bold text-forest-soft tabular-nums">
                    {formatThb(totalBomCost)}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Add row */}
      {isAdding ? (
        <IngredientPicker
          excludeIds={excludeIds}
          onCancel={() => setIsAdding(false)}
          onAdd={handleAdd}
        />
      ) : bom.length > 0 ? (
        <button
          onClick={() => setIsAdding(true)}
          className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-surface-3 bg-surface-1/30 px-3 py-1.5 text-xs text-cream/60 transition hover:border-forest-soft hover:bg-forest-soft/5 hover:text-forest-soft"
        >
          <Plus className="h-3 w-3" />
          Add ingredient
        </button>
      ) : null}
    </div>
  )
}

// ─── Ingredient Picker ─────────────────────────────────────────

interface IngredientPickerProps {
  excludeIds: Set<string>
  onCancel: () => void
  onAdd: (ingredientId: string, quantity: number) => Promise<void>
}

function IngredientPicker({ excludeIds, onCancel, onAdd }: IngredientPickerProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<DishIngredient[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [quantity, setQuantity] = useState<string>('')
  const [isSearching, setIsSearching] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus search on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Search ingredients (debounced)
  useEffect(() => {
    const timer = setTimeout(async () => {
      setIsSearching(true)
      const { data } = await supabase
        .from('nomenclature')
        .select('id, product_code, name, type, base_unit, cost_per_unit')
        .in('type', ['raw', 'semi', 'modifier'])
        .or(query.trim()
          ? `name.ilike.%${query}%,product_code.ilike.%${query}%`
          : 'id.not.is.null') // match-all when empty
        .eq('is_deleted', false)
        .order('name', { ascending: true })
        .limit(30)

      const filtered = (data ?? [])
        .filter((r) => !excludeIds.has(r.id as string))
        .map((r) => ({
          id: r.id as string,
          product_code: r.product_code as string,
          name: r.name as string,
          type: r.type as string,
          base_unit: (r.base_unit as string | null) ?? null,
          cost_per_unit: Number(r.cost_per_unit ?? 0),
        }))

      setResults(filtered)
      setIsSearching(false)
    }, 200)

    return () => clearTimeout(timer)
  }, [query, excludeIds])

  const selected = results.find((r) => r.id === selectedId) ?? null

  const handleSave = async () => {
    if (!selected) return
    const qty = Number(quantity)
    if (Number.isNaN(qty) || qty <= 0) return
    setIsSaving(true)
    await onAdd(selected.id, qty)
    setIsSaving(false)
  }

  return (
    <div className="rounded-lg border border-forest-soft/40 bg-surface-1/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-cream">Add ingredient</span>
        <button onClick={onCancel} className="rounded p-1 text-cream/50 hover:bg-surface-2 hover:text-cream/80">
          <X className="h-3 w-3" />
        </button>
      </div>

      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-cream/50" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search RAW / PF / MOD..."
          className="w-full rounded border border-surface-3 bg-surface-2 py-1.5 pl-7 pr-2 text-xs text-cream placeholder:text-cream/40 focus:border-forest-soft focus:outline-none"
        />
      </div>

      <div className="mb-2 max-h-48 overflow-y-auto rounded border border-surface-3">
        {isSearching ? (
          <div className="flex items-center justify-center py-4 text-[11px] text-cream/50">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Searching...
          </div>
        ) : results.length === 0 ? (
          <div className="py-4 text-center text-[11px] text-cream/50">No matches</div>
        ) : (
          results.map((r) => {
            const badge = typeBadge(r.type, r.product_code)
            return (
              <button
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className={`flex w-full items-center gap-2 border-b border-surface-3/60 px-2 py-1.5 text-left text-xs transition last:border-b-0 ${
                  selectedId === r.id
                    ? 'bg-royal-green/25 text-cream'
                    : 'text-cream/80 hover:bg-surface-2'
                }`}
              >
                <span className={`rounded px-1 py-0.5 text-[9px] font-bold ${badge.color}`}>
                  {badge.label}
                </span>
                <span className="flex-1 truncate">{r.name}</span>
                <span className="text-[10px] text-cream/50">{r.product_code}</span>
                <span className="text-[10px] text-cream/60 tabular-nums">
                  {formatThb(r.cost_per_unit)}/{r.base_unit ?? ''}
                </span>
              </button>
            )
          })
        )}
      </div>

      {selected && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-cream/60">
            Quantity ({selected.base_unit ?? 'unit'})
          </span>
          <input
            type="number"
            step="0.001"
            min={0}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && quantity) handleSave()
              if (e.key === 'Escape') onCancel()
            }}
            className="w-24 rounded border border-surface-3 bg-surface-2 px-2 py-1 text-right text-xs text-cream focus:border-forest-soft focus:outline-none"
            autoFocus
          />
          <button
            onClick={handleSave}
            disabled={!quantity || isSaving}
            className="inline-flex items-center gap-1 rounded bg-royal-green px-3 py-1 text-xs font-medium text-white transition hover:bg-forest-soft disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            Add
          </button>
        </div>
      )}
    </div>
  )
}
