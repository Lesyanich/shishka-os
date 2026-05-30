import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

/* ─── Types ─── */

export interface SaladBarSlot {
  id: string
  equipment_id: string
  unit_number: number
  slot_code: string
  gn_size: string
  depth_mm: number
  row: 'back' | 'front'
  position: number
  ingredient_id: string | null
  ingredient_name: string | null
  product_code: string | null
  color_group: string | null
  prep_location: string | null
  prep_method: string | null
  notes: string | null
}

export interface NomenclatureOption {
  id: string
  name: string
  product_code: string
}

export interface UseSaladBarLayoutResult {
  unit1Slots: SaladBarSlot[]
  unit2Slots: SaladBarSlot[]
  ingredients: NomenclatureOption[]
  isLoading: boolean
  error: string | null
  updateSlot: (slotId: string, patch: Partial<Pick<SaladBarSlot, 'ingredient_id' | 'color_group' | 'prep_location' | 'prep_method' | 'notes'>>) => Promise<{ ok: boolean; error?: string }>
  refetch: () => void
}

/* ─── Hook ─── */

export function useSaladBarLayout(): UseSaladBarLayoutResult {
  const [slots, setSlots] = useState<SaladBarSlot[]>([])
  const [ingredients, setIngredients] = useState<NomenclatureOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const [slotsRes, ingredientsRes] = await Promise.all([
      supabase
        .from('salad_bar_slots')
        .select('*, nomenclature:ingredient_id(id, name, product_code)')
        .order('unit_number')
        .order('row', { ascending: false }) // back first
        .order('position'),
      supabase
        .from('nomenclature')
        .select('id, name, product_code')
        .in('type', ['raw', 'semi_finished', 'modifier'])
        .eq('is_active', true)
        .order('product_code'),
    ])

    if (slotsRes.error) {
      console.error('[useSaladBarLayout] slots fetch error:', slotsRes.error.message)
      setError(slotsRes.error.message)
      setIsLoading(false)
      return
    }

    if (ingredientsRes.error) {
      console.error('[useSaladBarLayout] ingredients fetch error:', ingredientsRes.error.message)
      setError(ingredientsRes.error.message)
      setIsLoading(false)
      return
    }

    const mapped: SaladBarSlot[] = (slotsRes.data ?? []).map((row) => {
      const nom = row.nomenclature as { id: string; name: string; product_code: string } | null
      return {
        id: row.id,
        equipment_id: row.equipment_id,
        unit_number: row.unit_number,
        slot_code: row.slot_code,
        gn_size: row.gn_size,
        depth_mm: row.depth_mm,
        row: row.row,
        position: row.position,
        ingredient_id: row.ingredient_id,
        ingredient_name: nom?.name ?? null,
        product_code: nom?.product_code ?? null,
        color_group: row.color_group,
        prep_location: row.prep_location,
        prep_method: row.prep_method,
        notes: row.notes,
      }
    })

    setSlots(mapped)
    setIngredients(
      (ingredientsRes.data ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        product_code: r.product_code,
      })),
    )
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const unit1Slots = useMemo(() => slots.filter((s) => s.unit_number === 1), [slots])
  const unit2Slots = useMemo(() => slots.filter((s) => s.unit_number === 2), [slots])

  const updateSlot = useCallback(
    async (
      slotId: string,
      patch: Partial<Pick<SaladBarSlot, 'ingredient_id' | 'color_group' | 'prep_location' | 'prep_method' | 'notes'>>,
    ): Promise<{ ok: boolean; error?: string }> => {
      const { error: err } = await supabase
        .from('salad_bar_slots')
        .update(patch)
        .eq('id', slotId)

      if (err) {
        console.error('[useSaladBarLayout] update error:', err.message)
        return { ok: false, error: err.message }
      }

      // Refetch to get updated nomenclature join
      await fetchData()
      return { ok: true }
    },
    [fetchData],
  )

  return {
    unit1Slots,
    unit2Slots,
    ingredients,
    isLoading,
    error,
    updateSlot,
    refetch: fetchData,
  }
}
