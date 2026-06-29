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
import {
  groupLinesBySupplier,
  type GroupedReorder,
  type ReorderLine,
} from '../lib/reorderGrouping'

/** Result of grouping the buy-list into per-supplier draft POs. */
export interface POGroupingResult extends GroupedReorder {
  /** Needed items with no linked nomenclature — cannot become PO lines. */
  skippedNoProduct: number
}

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
  /** Seed the list from par breaches (v_stock_status low/out). */
  seedFromLowStock: (store?: ShoppingStore) => Promise<SeedResult>
  isSeeding: boolean
  /** Resolve a supplier per needed line and bucket into per-supplier groups. */
  buildPOGroups: (source?: ShoppingItem[]) => Promise<POGroupingResult>
  /** Mark the given items 'ordered' once a draft PO covers them. */
  markOrdered: (ids: string[]) => Promise<MutationResult>
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

  const seedFromLowStock = useCallback(
    async (store: ShoppingStore = 'makro'): Promise<SeedResult> => {
      setIsSeeding(true)
      const { data, error: rpcError } = await supabase.rpc('fn_seed_shopping_list_low_stock', {
        p_store: store,
      })
      setIsSeeding(false)
      if (rpcError) return { ok: false, error: rpcError.message }
      await fetchItems()
      return data as SeedResult
    },
    [fetchItems],
  )

  // Resolve a supplier per needed line (default_supplier_id → freshest
  // supplier_catalog row → Unassigned) and bucket into per-supplier groups.
  const buildPOGroups = useCallback(
    async (source?: ShoppingItem[]): Promise<POGroupingResult> => {
      const pool = (source ?? items).filter((i) => i.status === 'needed' && (i.qty ?? 0) > 0)
      const linked = pool.filter((i) => i.nomenclature_id)
      const skippedNoProduct = pool.length - linked.length
      const nomIds = Array.from(new Set(linked.map((i) => i.nomenclature_id as string)))
      if (nomIds.length === 0) return { groups: [], unassigned: [], skippedNoProduct }

      const [nomRes, catRes, supRes] = await Promise.all([
        supabase.from('nomenclature').select('id, default_supplier_id, base_unit').in('id', nomIds),
        supabase
          .from('supplier_catalog')
          .select('nomenclature_id, supplier_id, updated_at')
          .in('nomenclature_id', nomIds)
          .order('updated_at', { ascending: false }),
        supabase.from('suppliers').select('id, name'),
      ])

      const defaultSupplier = new Map<string, string | null>()
      const baseUnit = new Map<string, string | null>()
      for (const n of nomRes.data ?? []) {
        defaultSupplier.set(n.id, n.default_supplier_id ?? null)
        baseUnit.set(n.id, n.base_unit ?? null)
      }
      // First row per nomenclature is freshest (ordered desc) with a supplier.
      const catalogBest = new Map<string, string>()
      for (const c of catRes.data ?? []) {
        if (c.supplier_id && !catalogBest.has(c.nomenclature_id)) {
          catalogBest.set(c.nomenclature_id, c.supplier_id)
        }
      }
      const supplierName = new Map<string, string>(
        (supRes.data ?? []).map((s: { id: string; name: string }) => [s.id, s.name]),
      )

      const lines: ReorderLine[] = linked.map((i) => {
        const nomId = i.nomenclature_id as string
        const supplierId = defaultSupplier.get(nomId) || catalogBest.get(nomId) || null
        return {
          nomenclature_id: nomId,
          name: i.name,
          qty: i.qty ?? 1,
          unit: i.unit ?? baseUnit.get(nomId) ?? null,
          supplier_id: supplierId,
          supplier_name: supplierId ? supplierName.get(supplierId) ?? 'Supplier' : null,
        }
      })

      return { ...groupLinesBySupplier(lines), skippedNoProduct }
    },
    [items],
  )

  const markOrdered = useCallback(
    async (ids: string[]): Promise<MutationResult> => {
      if (ids.length === 0) return { ok: true }
      const { error: updateError } = await supabase
        .from('shopping_list_items')
        .update({ status: 'ordered' })
        .in('id', ids)
      if (updateError) return { ok: false, error: updateError.message }
      await fetchItems()
      return { ok: true }
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
    seedFromLowStock,
    isSeeding,
    buildPOGroups,
    markOrdered,
  }
}
