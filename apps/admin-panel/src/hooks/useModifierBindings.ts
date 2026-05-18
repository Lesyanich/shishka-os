import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export type SlotName = 'base' | 'protein' | 'greens' | 'topping' | 'sauce'

export interface ModifierBindingRow {
  id: string
  dish_id: string
  dish_code: string
  dish_name: string
  modifier_id: string
  modifier_code: string
  modifier_name: string
  slot: SlotName | null
  quantity_per_unit: number
  price_delta: number
  is_default: boolean
  sort_order: number
  loyverse_modifier_id: string | null
  loyverse_modifier_list_name: string | null
}

export interface BindingPatch {
  dish_id: string
  modifier_id: string
  slot: SlotName
  quantity_per_unit: number
  loyverse_modifier_id?: string | null
  loyverse_modifier_list_id?: string | null
  loyverse_modifier_list_name?: string | null
  price_delta?: number
  is_default?: boolean
  sort_order?: number
}

type RawRow = {
  id: string
  slot: SlotName | null
  quantity_per_unit: number
  price_delta: number
  is_default: boolean
  sort_order: number
  loyverse_modifier_id: string | null
  loyverse_modifier_list_name: string | null
  dish: { id: string; product_code: string; name: string } | { id: string; product_code: string; name: string }[] | null
  modifier: { id: string; product_code: string; name: string } | { id: string; product_code: string; name: string }[] | null
}

function resolveRelation(
  rel: { id: string; product_code: string; name: string } | { id: string; product_code: string; name: string }[] | null
): { id: string; product_code: string; name: string } | null {
  if (!rel) return null
  return Array.isArray(rel) ? (rel[0] ?? null) : rel
}

export function useModifierBindings() {
  const [rows, setRows] = useState<ModifierBindingRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setIsLoading(true)
    const { data, error: err } = await supabase
      .from('nomenclature_modifier_options')
      .select(`
        id, slot, quantity_per_unit, price_delta, is_default, sort_order,
        loyverse_modifier_id, loyverse_modifier_list_name,
        dish:dish_id ( id, product_code, name ),
        modifier:modifier_id ( id, product_code, name )
      `)
      .order('sort_order', { ascending: true })
    if (err) {
      setError(err.message)
      setRows([])
    } else {
      const flat: ModifierBindingRow[] = ((data ?? []) as RawRow[])
        .map((r) => {
          const dish = resolveRelation(r.dish)
          const modifier = resolveRelation(r.modifier)
          if (!dish || !modifier) return null
          return {
            id: r.id,
            dish_id: dish.id,
            dish_code: dish.product_code,
            dish_name: dish.name,
            modifier_id: modifier.id,
            modifier_code: modifier.product_code,
            modifier_name: modifier.name,
            slot: r.slot,
            quantity_per_unit: Number(r.quantity_per_unit),
            price_delta: Number(r.price_delta),
            is_default: r.is_default,
            sort_order: r.sort_order,
            loyverse_modifier_id: r.loyverse_modifier_id,
            loyverse_modifier_list_name: r.loyverse_modifier_list_name,
          } satisfies ModifierBindingRow
        })
        .filter((r): r is ModifierBindingRow => r !== null)
      setRows(flat)
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const create = useCallback(
    async (patch: BindingPatch) => {
      const { error: err } = await supabase
        .from('nomenclature_modifier_options')
        .insert(patch)
      if (err) return { ok: false as const, error: err.message }
      await reload()
      return { ok: true as const }
    },
    [reload]
  )

  const update = useCallback(
    async (id: string, patch: Partial<BindingPatch>) => {
      const { error: err } = await supabase
        .from('nomenclature_modifier_options')
        .update(patch)
        .eq('id', id)
      if (err) return { ok: false as const, error: err.message }
      await reload()
      return { ok: true as const }
    },
    [reload]
  )

  const remove = useCallback(
    async (id: string) => {
      const { error: err } = await supabase
        .from('nomenclature_modifier_options')
        .delete()
        .eq('id', id)
      if (err) return { ok: false as const, error: err.message }
      await reload()
      return { ok: true as const }
    },
    [reload]
  )

  return { rows, isLoading, error, create, update, remove, reload }
}
