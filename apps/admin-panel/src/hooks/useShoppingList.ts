import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type {
  ShoppingItem,
  ShoppingStatus,
  ShoppingStore,
  NewShoppingItem,
  ShoppingPatch,
  MutationResult,
  SeedResult,
} from '../types/shopping'

const SELECT_COLS =
  'id, name, store, product_url, image_url, qty, unit, est_price, notes, status, sort_order, nomenclature_id, source, created_at, updated_at, bought_at'

export interface UseShoppingListResult {
  items: ShoppingItem[]
  isLoading: boolean
  error: string | null
  statusFilter: ShoppingStatus | 'all'
  setStatusFilter: (s: ShoppingStatus | 'all') => void
  refetch: () => Promise<void>
  addItem: (item: NewShoppingItem) => Promise<MutationResult>
  updateItem: (id: string, patch: ShoppingPatch) => Promise<MutationResult>
  removeItem: (id: string) => Promise<MutationResult>
  seedFromMenu: (store?: ShoppingStore) => Promise<SeedResult>
  isSeeding: boolean
}

function normalize(row: ShoppingItem): ShoppingItem {
  return {
    ...row,
    qty: row.qty != null ? Number(row.qty) : null,
    est_price: row.est_price != null ? Number(row.est_price) : null,
    sort_order: row.sort_order != null ? Number(row.sort_order) : 0,
  }
}

export function useShoppingList(): UseShoppingListResult {
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<ShoppingStatus | 'all'>('all')
  const [isSeeding, setIsSeeding] = useState(false)

  const fetchItems = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('shopping_list_items')
      .select(SELECT_COLS)
      .order('store', { ascending: true })
      .order('status', { ascending: true })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (fetchError) {
      setError(fetchError.message)
      setIsLoading(false)
      return
    }

    setItems((data ?? []).map((r) => normalize(r as unknown as ShoppingItem)))
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchItems()

    const channel = supabase
      .channel('shopping-list-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shopping_list_items' },
        () => { fetchItems() },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchItems])

  const addItem = useCallback(
    async (item: NewShoppingItem): Promise<MutationResult> => {
      const { error: insertError } = await supabase
        .from('shopping_list_items')
        .insert({
          name: item.name,
          store: item.store,
          product_url: item.product_url ?? null,
          qty: item.qty ?? 1,
          unit: item.unit ?? null,
          est_price: item.est_price ?? null,
          notes: item.notes ?? null,
          source: 'manual',
        })

      if (insertError) return { ok: false, error: insertError.message }
      await fetchItems()
      return { ok: true }
    },
    [fetchItems],
  )

  const updateItem = useCallback(
    async (id: string, patch: ShoppingPatch): Promise<MutationResult> => {
      const payload: Record<string, unknown> = { ...patch }
      // Stamp/clear bought_at when status crosses the bought boundary
      if (patch.status === 'bought') payload.bought_at = new Date().toISOString()
      if (patch.status === 'needed' || patch.status === 'cancelled') payload.bought_at = null

      // Optimistic local update for snappy UI; realtime will reconcile
      setItems((prev) =>
        prev.map((it) => (it.id === id ? { ...it, ...(payload as Partial<ShoppingItem>) } : it)),
      )

      const { error: updateError } = await supabase
        .from('shopping_list_items')
        .update(payload)
        .eq('id', id)

      if (updateError) {
        await fetchItems() // revert optimistic change
        return { ok: false, error: updateError.message }
      }
      return { ok: true }
    },
    [fetchItems],
  )

  const removeItem = useCallback(
    async (id: string): Promise<MutationResult> => {
      setItems((prev) => prev.filter((it) => it.id !== id))
      const { error: deleteError } = await supabase
        .from('shopping_list_items')
        .delete()
        .eq('id', id)

      if (deleteError) {
        await fetchItems()
        return { ok: false, error: deleteError.message }
      }
      return { ok: true }
    },
    [fetchItems],
  )

  const seedFromMenu = useCallback(
    async (store: ShoppingStore = 'makro'): Promise<SeedResult> => {
      setIsSeeding(true)
      const { data, error: rpcError } = await supabase.rpc('fn_seed_shopping_list_from_menu', {
        p_store: store,
      })
      setIsSeeding(false)

      if (rpcError) return { ok: false, error: rpcError.message }
      await fetchItems()
      return data as SeedResult
    },
    [fetchItems],
  )

  return {
    items,
    isLoading,
    error,
    statusFilter,
    setStatusFilter,
    refetch: fetchItems,
    addItem,
    updateItem,
    removeItem,
    seedFromMenu,
    isSeeding,
  }
}
