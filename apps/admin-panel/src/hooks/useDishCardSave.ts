import { useCallback, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface DishCardSavePayload {
  expected_version: number
  customer_description?: string
  customer_short_name?: string
  customer_photo_url?: string
  assembler_note?: string
  merrychef_program?: { temp_c: number; time_sec: number } | null
  ttc_source_url?: string
  dish_card?: {
    container_l2?: string
    assembly_order?: { step: number; text: string }[]
    pre_merrychef_prep?: string
    post_merrychef_check?: string
    cold_addons_after_reheat?: string
    has_cutlery?: boolean
    has_lid_sticker?: boolean
    assembler_photo_url?: string
    customer_eta_min?: number
    composition_override?: string
  }
}

export interface PfPackCardSavePayload {
  expected_version: number
  kitchen_note?: string
  ttc_source_url?: string
  pf_pack_card?: {
    batch_input_qty?: number
    batch_input_uom?: string
    portions_per_batch?: number
    portion_weight_g?: number
    vacuum_bag_size?: string
    fill_weight_per_bag_g?: number
    portions_per_bag?: number
    label_template?: { fields: string[] }
    shelf_life_days?: number
    storage_zone?: string
    storage_temp_min_c?: number
    storage_temp_max_c?: number
    kitchen_photo_url?: string
  }
}

export interface SaveResult {
  ok: boolean
  newVersion?: number
  error?: string
  conflict?: { current_version: number }
}

export interface UseDishCardSaveResult {
  saveDishCard: (dishId: string, payload: DishCardSavePayload) => Promise<SaveResult>
  savePfPackCard: (pfId: string, payload: PfPackCardSavePayload) => Promise<SaveResult>
  isSaving: boolean
}

export function useDishCardSave(): UseDishCardSaveResult {
  const [isSaving, setIsSaving] = useState(false)

  const saveDishCard = useCallback(
    async (dishId: string, payload: DishCardSavePayload): Promise<SaveResult> => {
      setIsSaving(true)
      const { data, error } = await supabase.rpc('fn_dish_card_save', {
        p_dish_id: dishId,
        p_payload: payload as unknown as Record<string, unknown>,
      })
      setIsSaving(false)
      if (error) return { ok: false, error: error.message }
      const result = data as {
        ok: boolean
        new_version?: number
        conflict?: { current_version: number }
        error?: string
      }
      if (!result.ok) {
        if (result.conflict) return { ok: false, conflict: result.conflict }
        return { ok: false, error: result.error ?? 'Save failed' }
      }
      return { ok: true, newVersion: result.new_version }
    },
    [],
  )

  const savePfPackCard = useCallback(
    async (pfId: string, payload: PfPackCardSavePayload): Promise<SaveResult> => {
      setIsSaving(true)
      const { data, error } = await supabase.rpc('fn_pf_pack_card_save', {
        p_pf_id: pfId,
        p_payload: payload as unknown as Record<string, unknown>,
      })
      setIsSaving(false)
      if (error) return { ok: false, error: error.message }
      const result = data as {
        ok: boolean
        new_version?: number
        conflict?: { current_version: number }
        error?: string
      }
      if (!result.ok) {
        if (result.conflict) return { ok: false, conflict: result.conflict }
        return { ok: false, error: result.error ?? 'Save failed' }
      }
      return { ok: true, newVersion: result.new_version }
    },
    [],
  )

  return { saveDishCard, savePfPackCard, isSaving }
}
