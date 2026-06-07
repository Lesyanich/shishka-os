import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.ts'

/** tier_code → discount percent (e.g. 'bundle8' → 15). Read from price_tiers,
 *  the single source of truth for channel/promo discounts. */
export function usePriceTiers(): { discounts: Record<string, number>; isLoading: boolean } {
  const [discounts, setDiscounts] = useState<Record<string, number>>({})
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('price_tiers')
        .select('tier_code, discount_pct')
        .eq('is_active', true)
      if (cancelled) return
      const map: Record<string, number> = {}
      for (const row of (data ?? []) as { tier_code: string; discount_pct: number }[]) {
        map[row.tier_code] = Number(row.discount_pct)
      }
      setDiscounts(map)
      setIsLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return { discounts, isLoading }
}
