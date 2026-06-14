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

/**
 * Save pf_pack_card fields via fn_pf_pack_card_save (optimistic-locked on
 * nomenclature.card_version). `patch` holds any pf_pack_card columns to upsert,
 * e.g. { shelf_life_days: 3 }. Unspecified columns are preserved.
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
        const { data, error } = await supabase.rpc('fn_pf_pack_card_save', {
          p_pf_id: pfId,
          p_payload: { expected_version: expectedVersion, pf_pack_card: patch },
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
