import { useState, useCallback, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export type LvStatus = 'ok' | 'not_in_lv' | 'not_pulled' | 'deleted_in_lv'

export interface LoyverseSyncRow {
  nomenclature_id: string
  lv_has_photo: boolean
  has_our_photo: boolean
  lv_price: number | null
  our_price: number | null
  price_mismatch: boolean
  lv_status: LvStatus
  pulled_at: string | null
  lv_image_url: string | null
}

export function useLoyverseSync() {
  const [syncMap, setSyncMap] = useState<Map<string, LoyverseSyncRow>>(new Map())
  const [isLoading, setIsLoading] = useState(false)
  const [isPulling, setIsPulling] = useState(false)
  const [lastPulledAt, setLastPulledAt] = useState<string | null>(null)
  const [pullResult, setPullResult] = useState<{ total: number; with_photo: number } | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const { data } = await supabase
        .from('v_loyverse_sync_status')
        .select(
          'nomenclature_id,lv_has_photo,has_our_photo,lv_price,our_price,price_mismatch,lv_status,pulled_at,lv_image_url',
        )
      if (data) {
        const map = new Map<string, LoyverseSyncRow>()
        let latest = ''
        for (const row of data as LoyverseSyncRow[]) {
          map.set(row.nomenclature_id, row)
          if (row.pulled_at && row.pulled_at > latest) latest = row.pulled_at
        }
        setSyncMap(map)
        setLastPulledAt(latest || null)
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const pullFromLoyverse = useCallback(async () => {
    setIsPulling(true)
    setPullResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const url = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/loyverse-sync?action=pull_items_status`
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const body = await res.json() as { ok: boolean; total?: number; with_photo?: number }
      if (body.ok) {
        setPullResult({ total: body.total ?? 0, with_photo: body.with_photo ?? 0 })
      }
      await load()
    } finally {
      setIsPulling(false)
    }
  }, [load])

  return { syncMap, isLoading, isPulling, lastPulledAt, pullResult, pullFromLoyverse, reload: load }
}
