import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface DishIngredient {
  id: string
  product_code: string
  name: string
  type: string
  base_unit: string | null
  cost_per_unit: number
}

export interface DishBomRow {
  id: string
  parent_id: string
  ingredient_id: string
  quantity_per_unit: number
  yield_loss_pct: number | null
  notes: string | null
  ingredient: DishIngredient | null
  // computed: cost contribution = quantity * cost_per_unit * (1 + yield_loss_pct/100)
  cost_contribution: number
}

export interface UseDishDetailResult {
  bom: DishBomRow[]
  pfChildren: DishIngredient[] // subset of BOM with type = semi-finished
  totalBomCost: number
  isLoading: boolean
  error: string | null
  addIngredient: (ingredientId: string, quantityPerUnit: number) => Promise<{ ok: boolean; error?: string }>
  updateBomRow: (
    rowId: string,
    patch: Partial<Pick<DishBomRow, 'quantity_per_unit' | 'yield_loss_pct' | 'notes'>>,
  ) => Promise<{ ok: boolean; error?: string }>
  removeBomRow: (rowId: string) => Promise<{ ok: boolean; error?: string }>
  refetch: () => Promise<void>
}

function computeCost(quantity: number, costPerUnit: number, yieldLossPct: number | null): number {
  const lossMultiplier = yieldLossPct !== null ? 1 + yieldLossPct / 100 : 1
  return quantity * costPerUnit * lossMultiplier
}

export function useDishDetail(dishId: string | null): UseDishDetailResult {
  const [bom, setBom] = useState<DishBomRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDetail = useCallback(async () => {
    if (!dishId) {
      setBom([])
      return
    }

    setIsLoading(true)
    setError(null)

    const { data: bomRows, error: bomError } = await supabase
      .from('bom_structures')
      .select('id, parent_id, ingredient_id, quantity_per_unit, yield_loss_pct, notes, created_at')
      .eq('parent_id', dishId)
      .order('created_at', { ascending: true })

    if (bomError) {
      setError(bomError.message)
      setIsLoading(false)
      return
    }

    const ingredientIds = Array.from(
      new Set((bomRows ?? []).map((r) => r.ingredient_id as string)),
    )

    const ingredientsById = new Map<string, DishIngredient>()

    if (ingredientIds.length > 0) {
      const { data: ingRows, error: ingError } = await supabase
        .from('nomenclature')
        .select('id, product_code, name, type, base_unit, cost_per_unit')
        .in('id', ingredientIds)

      if (ingError) {
        setError(ingError.message)
        setIsLoading(false)
        return
      }

      for (const row of ingRows ?? []) {
        ingredientsById.set(row.id as string, {
          id: row.id as string,
          product_code: row.product_code as string,
          name: row.name as string,
          type: row.type as string,
          base_unit: (row.base_unit as string | null) ?? null,
          cost_per_unit: Number(row.cost_per_unit ?? 0),
        })
      }
    }

    const mapped: DishBomRow[] = (bomRows ?? []).map((row) => {
      const ingredient = ingredientsById.get(row.ingredient_id as string) ?? null
      const qty = Number(row.quantity_per_unit ?? 0)
      const yieldLoss = row.yield_loss_pct === null ? null : Number(row.yield_loss_pct as number)
      const cost = ingredient ? computeCost(qty, ingredient.cost_per_unit, yieldLoss) : 0
      return {
        id: row.id as string,
        parent_id: row.parent_id as string,
        ingredient_id: row.ingredient_id as string,
        quantity_per_unit: qty,
        yield_loss_pct: yieldLoss,
        notes: (row.notes as string | null) ?? null,
        ingredient,
        cost_contribution: cost,
      }
    })

    setBom(mapped)
    setIsLoading(false)
  }, [dishId])

  useEffect(() => {
    fetchDetail()
  }, [fetchDetail])

  const addIngredient = useCallback(
    async (ingredientId: string, quantityPerUnit: number): Promise<{ ok: boolean; error?: string }> => {
      if (!dishId) return { ok: false, error: 'No dish selected' }

      const { error: insertError } = await supabase.from('bom_structures').insert({
        parent_id: dishId,
        ingredient_id: ingredientId,
        quantity_per_unit: quantityPerUnit,
      })

      if (insertError) return { ok: false, error: insertError.message }

      await fetchDetail()
      return { ok: true }
    },
    [dishId, fetchDetail],
  )

  const updateBomRow = useCallback(
    async (
      rowId: string,
      patch: Partial<Pick<DishBomRow, 'quantity_per_unit' | 'yield_loss_pct' | 'notes'>>,
    ): Promise<{ ok: boolean; error?: string }> => {
      const updates: Record<string, unknown> = {}
      if (patch.quantity_per_unit !== undefined) updates.quantity_per_unit = patch.quantity_per_unit
      if (patch.yield_loss_pct !== undefined) updates.yield_loss_pct = patch.yield_loss_pct
      if (patch.notes !== undefined) updates.notes = patch.notes

      const { error: updateError } = await supabase
        .from('bom_structures')
        .update(updates)
        .eq('id', rowId)

      if (updateError) return { ok: false, error: updateError.message }

      await fetchDetail()
      return { ok: true }
    },
    [fetchDetail],
  )

  const removeBomRow = useCallback(
    async (rowId: string): Promise<{ ok: boolean; error?: string }> => {
      const { error: deleteError } = await supabase
        .from('bom_structures')
        .delete()
        .eq('id', rowId)

      if (deleteError) return { ok: false, error: deleteError.message }

      await fetchDetail()
      return { ok: true }
    },
    [fetchDetail],
  )

  const pfChildren = bom
    .filter((r) => r.ingredient && (r.ingredient.type === 'semi' || r.ingredient.product_code.startsWith('PF-')))
    .map((r) => r.ingredient!)
    .filter((ing, idx, arr) => arr.findIndex((x) => x.id === ing.id) === idx)

  const totalBomCost = bom.reduce((sum, row) => sum + row.cost_contribution, 0)

  return {
    bom,
    pfChildren,
    totalBomCost,
    isLoading,
    error,
    addIngredient,
    updateBomRow,
    removeBomRow,
    refetch: fetchDetail,
  }
}
