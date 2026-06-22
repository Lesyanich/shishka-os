import { useCallback, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface PfPackCardSaveResult {
  ok: boolean
  error?: string
  /** Bumped nomenclature.card_version — feed back as the next expected_version. */
  newVersion?: number
}

interface RpcResponse {
  ok: boolean
  error?: string
  new_version?: number
  conflict?: { current_version: number }
}

/** Fields that live on nomenclature, not pf_pack_card — they must be sent at the
 * top level of the RPC payload (sibling of expected_version), never under
 * `pf_pack_card`. shelf_life_days is the single source of truth on nomenclature
 * (mig 307): the storage label and batch expiry (fn_create_batches_from_task)
 * both read it, so the label save must reach nomenclature. */
const NOMENCLATURE_LEVEL_KEYS = ['shelf_life_days', 'kitchen_note', 'ttc_source_url'] as const

/**
 * Save a PF card via fn_pf_pack_card_save (optimistic-locked on
 * nomenclature.card_version). `patch` may mix pf_pack_card columns and
 * nomenclature-level fields (shelf_life_days / kitchen_note / ttc_source_url);
 * the latter are routed to the payload top level so they land on nomenclature.
 * Unspecified columns are preserved.
 */
export function usePfPackCardSave() {
  const [saving, setSaving] = useState(false)

  const save = useCallback(
    async (
      pfId: string,
      expectedVersion: number,
      patch: Record<string, unknown>,
    ): Promise<PfPackCardSaveResult> => {
      setSaving(true)
      try {
        // Split nomenclature-level fields out of the pf_pack_card patch.
        const payload: Record<string, unknown> = { expected_version: expectedVersion }
        const packCard: Record<string, unknown> = {}
        for (const [key, val] of Object.entries(patch)) {
          if ((NOMENCLATURE_LEVEL_KEYS as readonly string[]).includes(key)) {
            payload[key] = val
          } else {
            packCard[key] = val
          }
        }
        payload.pf_pack_card = packCard
        const { data, error } = await supabase.rpc('fn_pf_pack_card_save', {
          p_pf_id: pfId,
          p_payload: payload,
        })
        if (error) return { ok: false, error: error.message }
        const res = data as RpcResponse | null
        if (!res?.ok) {
          if (res?.conflict) return { ok: false, error: 'version_conflict' }
          return { ok: false, error: res?.error ?? 'save_failed' }
        }
        return { ok: true, newVersion: res.new_version }
      } finally {
        setSaving(false)
      }
    },
    [],
  )

  return { save, saving }
}
