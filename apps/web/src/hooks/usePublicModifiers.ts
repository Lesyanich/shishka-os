import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.ts'

export interface PublicModifierOption {
  optionName: string
  optionEmoji: string | null
  priceDelta: number
  isDefault: boolean
  stockState: string | null
  calories: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
}

export interface PublicModifierGroup {
  groupName: string
  groupSort: number
  minSelect: number
  maxSelect: number | null
  options: PublicModifierOption[]
}

export function usePublicModifiers(dishId: string | null) {
  const [groups, setGroups] = useState<PublicModifierGroup[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!dishId) {
      setGroups([])
      setError(null)
      return
    }
    let cancelled = false
    setIsLoading(true)
    setError(null)
    ;(async () => {
      const { data, error: err } = await supabase
        .from('menu_modifiers')
        .select('*')
        .eq('dish_id', dishId)
        .order('group_sort', { ascending: true })
        .order('sort_order', { ascending: true })

      if (cancelled) return
      if (err) {
        setError(err.message)
        setIsLoading(false)
        return
      }

      const byGroup = new Map<string, PublicModifierGroup>()
      for (const row of (data ?? []) as Record<string, unknown>[]) {
        const gn = row.group_name as string
        if (!byGroup.has(gn)) {
          byGroup.set(gn, {
            groupName: gn,
            groupSort: (row.group_sort as number) ?? 0,
            minSelect: (row.group_min_select as number) ?? 0,
            maxSelect: (row.group_max_select as number | null) ?? null,
            options: [],
          })
        }
        byGroup.get(gn)!.options.push({
          optionName: row.option_name as string,
          optionEmoji: (row.option_emoji as string | null) ?? null,
          priceDelta: (row.price_delta as number) ?? 0,
          isDefault: (row.is_default as boolean) ?? false,
          stockState: (row.option_stock_state as string | null) ?? null,
          calories: (row.calories as number | null) ?? null,
          protein: (row.protein as number | null) ?? null,
          carbs: (row.carbs as number | null) ?? null,
          fat: (row.fat as number | null) ?? null,
        })
      }

      setGroups([...byGroup.values()].sort((a, b) => a.groupSort - b.groupSort))
      setIsLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [dishId])

  return { groups, isLoading, error }
}
