import { useCallback, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface PushDishPayload {
  name: string
  description: string
  image_url: string | null
  default_price: number | null
}

export interface PushDishResult {
  ok: boolean
  loyverse_item_id?: string
  payload?: PushDishPayload
  error?: string
  reason?: string
  pos_status?: string
  is_available?: boolean
}

/** Calls the loyverse-sync Edge Function `push_dish` action for a single
 * SALE-* dish. The Edge Function gates on pos_status='approved' AND
 * is_available=true via fn_loyverse_sync_dish. On success, the dish's
 * loyverse_item_id is updated and pos_status is bumped to 'synced'. */
export function useLoyversePushDish() {
  const [isPushing, setIsPushing] = useState(false)
  const [lastResult, setLastResult] = useState<PushDishResult | null>(null)

  const pushDish = useCallback(
    async (dishId: string): Promise<PushDishResult> => {
      setIsPushing(true)
      setLastResult(null)
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const token = session?.access_token
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
        const res = await fetch(
          `${supabaseUrl}/functions/v1/loyverse-sync?action=push_dish&dish_id=${encodeURIComponent(dishId)}`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          },
        )
        const result = (await res.json()) as PushDishResult
        setLastResult(result)
        return result
      } catch (e) {
        const result: PushDishResult = {
          ok: false,
          error: e instanceof Error ? e.message : 'Network error',
        }
        setLastResult(result)
        return result
      } finally {
        setIsPushing(false)
      }
    },
    [],
  )

  return { pushDish, isPushing, lastResult }
}
