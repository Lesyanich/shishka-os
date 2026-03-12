import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface InventoryItem {
  nomenclature_id: string
  product_code: string
  name: string
  type: string
  base_unit: string | null
  quantity: number
  last_counted_at: string | null
}

export interface UseInventoryResult {
  items: InventoryItem[]
  isLoading: boolean
  error: string | null
  refetch: () => void
  upsertBalance: (
    nomenclatureId: string,
    quantity: number,
  ) => Promise<{ ok: boolean; error?: string }>
}

export function useInventory(): UseInventoryResult {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchInventory = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    // Two queries: nomenclature (RAW + PF) + inventory_balances, joined in JS
    const [nomResult, invResult] = await Promise.all([
      supabase
        .from('nomenclature')
        .select('id, product_code, name, type, base_unit')
        .in('type', ['good', 'dish'])
        .order('product_code', { ascending: true }),
      supabase
        .from('inventory_balances')
        .select('nomenclature_id, quantity, last_counted_at'),
    ])

    if (nomResult.error) {
      setError(nomResult.error.message)
      setIsLoading(false)
      return
    }
    if (invResult.error) {
      setError(invResult.error.message)
      setIsLoading(false)
      return
    }

    const balanceMap = new Map(
      (invResult.data ?? []).map((b) => [b.nomenclature_id, b]),
    )

    const merged: InventoryItem[] = (nomResult.data ?? []).map((n) => {
      const balance = balanceMap.get(n.id)
      return {
        nomenclature_id: n.id,
        product_code: n.product_code,
        name: n.name,
        type: n.type,
        base_unit: n.base_unit,
        quantity: balance ? Number(balance.quantity) : 0,
        last_counted_at: balance?.last_counted_at ?? null,
      }
    })

    setItems(merged)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchInventory()
  }, [fetchInventory])

  const upsertBalance = useCallback(
    async (
      nomenclatureId: string,
      quantity: number,
    ): Promise<{ ok: boolean; error?: string }> => {
      const { error: upsertError } = await supabase
        .from('inventory_balances')
        .upsert(
          {
            nomenclature_id: nomenclatureId,
            quantity,
            last_counted_at: new Date().toISOString(),
          },
          { onConflict: 'nomenclature_id' },
        )

      if (upsertError) {
        return { ok: false, error: upsertError.message }
      }
      return { ok: true }
    },
    [],
  )

  return { items, isLoading, error, refetch: fetchInventory, upsertBalance }
}
