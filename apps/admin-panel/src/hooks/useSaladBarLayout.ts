import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  EQUIPMENT_ID,
  FACTORY_LAYOUT,
  rowLabel,
  type GnSize,
} from '../components/equipment/saladBarGrid'

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
  depth_pos: number
  grid_col: number
  grid_row: number
  x_mm: number
  y_mm: number
  rotation: number
  ingredient_id: string | null
  ingredient_name: string | null
  display_name: string | null
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

type MutResult = { ok: boolean; error?: string }

export interface UseSaladBarLayoutResult {
  unit1Slots: SaladBarSlot[]
  unit2Slots: SaladBarSlot[]
  ingredients: NomenclatureOption[]
  isLoading: boolean
  error: string | null
  updateSlot: (slotId: string, patch: Partial<Pick<SaladBarSlot, 'ingredient_id' | 'color_group' | 'prep_location' | 'prep_method' | 'notes'>>) => Promise<MutResult>
  moveSlot: (slotId: string, xMm: number, yMm: number, rotation: number) => Promise<MutResult>
  addSlot: (args: { unitNumber: 1 | 2; gnSize: GnSize; xMm: number; yMm: number; rotation: number }) => Promise<MutResult>
  removeSlot: (slotId: string) => Promise<MutResult>
  resetToFactory: (unitNumber: 1 | 2) => Promise<MutResult>
  refetch: () => void
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi))

/* Legacy grid/back-front fields derived from real mm coords, kept NOT-NULL-valid. */
function legacyFromXY(xMm: number, yMm: number) {
  const gridCol = clamp(Math.round(xMm / 88), 0, 15)
  const gridRow = clamp(Math.round(yMm / 54), 0, 11)
  return {
    grid_col: gridCol,
    grid_row: gridRow,
    position: Math.floor(gridCol / 2) + 1,
    row: rowLabel(gridRow),
    depth_pos: gridRow,
  }
}

/* ─── Hook ─── */

export function useSaladBarLayout(): UseSaladBarLayoutResult {
  const [slots, setSlots] = useState<SaladBarSlot[]>([])
  const [ingredients, setIngredients] = useState<NomenclatureOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setIsLoading(true)
    setError(null)

    const [slotsRes, ingredientsRes] = await Promise.all([
      supabase
        .from('salad_bar_slots')
        .select('*, nomenclature:ingredient_id(id, name, product_code)')
        .order('unit_number')
        .order('y_mm')
        .order('x_mm'),
      supabase
        .from('nomenclature')
        .select('id, name, product_code')
        .in('type', ['raw', 'semi_finished', 'modifier'])
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
      const gridCol = row.grid_col ?? Math.max((row.position ?? 1) - 1, 0) * 2
      const gridRow = row.grid_row ?? (row.row === 'back' ? 0 : 6)
      return {
        id: row.id,
        equipment_id: row.equipment_id,
        unit_number: row.unit_number,
        slot_code: row.slot_code,
        gn_size: row.gn_size,
        depth_mm: row.depth_mm,
        row: row.row,
        position: row.position,
        depth_pos: row.depth_pos ?? 0,
        grid_col: gridCol,
        grid_row: gridRow,
        x_mm: row.x_mm ?? gridCol * 88,
        y_mm: row.y_mm ?? gridRow * 54,
        rotation: row.rotation ?? 0,
        ingredient_id: row.ingredient_id,
        ingredient_name: nom?.name ?? null,
        display_name: row.display_name ?? null,
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
    ): Promise<MutResult> => {
      const { error: err } = await supabase.from('salad_bar_slots').update(patch).eq('id', slotId)
      if (err) {
        console.error('[useSaladBarLayout] update error:', err.message)
        return { ok: false, error: err.message }
      }
      await fetchData({ silent: true })
      return { ok: true }
    },
    [fetchData],
  )

  // Move/rotate a pan. No refetch on success — caller holds optimistic state.
  const moveSlot = useCallback(
    async (slotId: string, xMm: number, yMm: number, rotation: number): Promise<MutResult> => {
      const patch = { x_mm: Math.round(xMm), y_mm: Math.round(yMm), rotation, ...legacyFromXY(xMm, yMm) }
      const { error: err } = await supabase.from('salad_bar_slots').update(patch).eq('id', slotId)
      if (err) {
        console.error('[useSaladBarLayout] moveSlot error:', err.message)
        return { ok: false, error: err.message }
      }
      setSlots((prev) => prev.map((s) => (s.id === slotId ? { ...s, ...patch } : s)))
      return { ok: true }
    },
    [],
  )

  const addSlot = useCallback(
    async ({
      unitNumber,
      gnSize,
      xMm,
      yMm,
      rotation,
    }: {
      unitNumber: 1 | 2
      gnSize: GnSize
      xMm: number
      yMm: number
      rotation: number
    }): Promise<MutResult> => {
      const insert = {
        equipment_id: EQUIPMENT_ID[unitNumber],
        unit_number: unitNumber,
        slot_code: `U${unitNumber}-${Math.round(xMm)}-${Math.round(yMm)}-${Date.now().toString(36)}`,
        gn_size: gnSize,
        depth_mm: 100,
        x_mm: Math.round(xMm),
        y_mm: Math.round(yMm),
        rotation,
        ...legacyFromXY(xMm, yMm),
        ingredient_id: null,
        display_name: null,
        color_group: null,
      }
      const { error: err } = await supabase.from('salad_bar_slots').insert(insert)
      if (err) {
        console.error('[useSaladBarLayout] addSlot error:', err.message)
        return { ok: false, error: err.message }
      }
      await fetchData({ silent: true })
      return { ok: true }
    },
    [fetchData],
  )

  const removeSlot = useCallback(
    async (slotId: string): Promise<MutResult> => {
      // Optimistic: drop it locally first so there's no spinner/reload.
      setSlots((prev) => prev.filter((s) => s.id !== slotId))
      const { error: err } = await supabase.from('salad_bar_slots').delete().eq('id', slotId)
      if (err) {
        console.error('[useSaladBarLayout] removeSlot error:', err.message)
        await fetchData({ silent: true }) // restore on failure, no spinner
        return { ok: false, error: err.message }
      }
      return { ok: true }
    },
    [fetchData],
  )

  const resetToFactory = useCallback(
    async (unitNumber: 1 | 2): Promise<MutResult> => {
      const layout = FACTORY_LAYOUT[unitNumber]
      const equipment_id = EQUIPMENT_ID[unitNumber]

      const codes = Array.from(new Set(layout.map((p) => p.p).filter(Boolean))) as string[]
      const idByCode = new Map<string, string>()
      if (codes.length > 0) {
        const { data } = await supabase
          .from('nomenclature')
          .select('id, product_code')
          .in('product_code', codes)
        for (const r of data ?? []) idByCode.set(r.product_code, r.id)
      }

      const { error: delErr } = await supabase
        .from('salad_bar_slots')
        .delete()
        .eq('equipment_id', equipment_id)
      if (delErr) {
        console.error('[useSaladBarLayout] resetToFactory delete error:', delErr.message)
        return { ok: false, error: delErr.message }
      }

      const rows = layout.map((p) => {
        const xMm = p.c * 88
        const yMm = p.r * 54
        return {
          equipment_id,
          unit_number: unitNumber,
          slot_code: `U${unitNumber}-${p.c}-${p.r}`,
          gn_size: p.s,
          depth_mm: p.s === '1/3' || p.s === '1/2' || p.s === '1/1' ? 150 : 100,
          x_mm: xMm,
          y_mm: yMm,
          rotation: 0,
          ...legacyFromXY(xMm, yMm),
          ingredient_id: p.p ? idByCode.get(p.p) ?? null : null,
          display_name: p.n ?? null,
          color_group: p.g ?? null,
        }
      })

      const { error: insErr } = await supabase.from('salad_bar_slots').insert(rows)
      if (insErr) {
        console.error('[useSaladBarLayout] resetToFactory insert error:', insErr.message)
        await fetchData({ silent: true })
        return { ok: false, error: insErr.message }
      }
      await fetchData({ silent: true })
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
    moveSlot,
    addSlot,
    removeSlot,
    resetToFactory,
    refetch: fetchData,
  }
}
