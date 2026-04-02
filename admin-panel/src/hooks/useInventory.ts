// ═══════════════════════════════════════════════════════════
// Hook: useInventory
// Phase 10: SKU-level inventory via sku_balances
// Two modes: byNomenclature (aggregated, for BOM/waste)
//            bySku (detailed, for stocktake/scanner)
// ═══════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/** Aggregated inventory at nomenclature level (for BOM, waste, recipes) */
export interface InventoryItem {
  nomenclature_id: string
  product_code: string
  name: string
  type: string
  base_unit: string | null
  quantity: number
  last_counted_at: string | null
}

/** Detailed inventory at SKU level (for stocktake, scanner) */
export interface SkuInventoryItem {
  sku_id: string
  sku_code: string
  nomenclature_id: string
  product_code: string
  nomenclature_name: string
  product_name: string
  brand: string | null
  barcode: string | null
  package_weight: string | null
  base_unit: string | null
  quantity: number
  last_counted_at: string | null
  last_received_at: string | null
}

export interface UseInventoryResult {
  items: InventoryItem[]
  skuItems: SkuInventoryItem[]
  isLoading: boolean
  error: string | null
  refetch: () => void
  /** Backward-compat: upsert at nomenclature level (finds primary SKU) */
  upsertBalance: (
    nomenclatureId: string,
    quantity: number,
  ) => Promise<{ ok: boolean; error?: string }>
  /** Phase 10: Upsert balance at SKU level */
  upsertSkuBalance: (
    skuId: string,
    quantity: number,
  ) => Promise<{ ok: boolean; error?: string }>
}

export function useInventory(): UseInventoryResult {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [skuItems, setSkuItems] = useState<SkuInventoryItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchInventory = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    // Three queries: nomenclature + sku_balances + sku, joined in JS
    const [nomResult, balResult, skuResult] = await Promise.all([
      supabase
        .from('nomenclature')
        .select('id, product_code, name, type, base_unit')
        .in('type', ['good', 'dish'])
        .order('product_code', { ascending: true }),
      supabase
        .from('sku_balances')
        .select('sku_id, nomenclature_id, quantity, last_counted_at, last_received_at'),
      supabase
        .from('sku')
        .select('id, sku_code, nomenclature_id, product_name, brand, barcode, package_weight'),
    ])

    if (nomResult.error) {
      setError(nomResult.error.message)
      setIsLoading(false)
      return
    }
    if (balResult.error) {
      setError(balResult.error.message)
      setIsLoading(false)
      return
    }

    // Build nomenclature map
    const nomMap = new Map(
      (nomResult.data ?? []).map((n) => [n.id, n]),
    )

    // Build SKU map
    const skuMap = new Map(
      (skuResult.data ?? []).map((s) => [s.id, s]),
    )

    // === Aggregated view (byNomenclature) ===
    const nomAgg = new Map<string, { quantity: number; last_counted_at: string | null }>()
    for (const b of balResult.data ?? []) {
      const existing = nomAgg.get(b.nomenclature_id)
      if (existing) {
        existing.quantity += Number(b.quantity ?? 0)
        if (b.last_counted_at && (!existing.last_counted_at || b.last_counted_at > existing.last_counted_at)) {
          existing.last_counted_at = b.last_counted_at
        }
      } else {
        nomAgg.set(b.nomenclature_id, {
          quantity: Number(b.quantity ?? 0),
          last_counted_at: b.last_counted_at ?? null,
        })
      }
    }

    const mergedItems: InventoryItem[] = (nomResult.data ?? []).map((n) => {
      const agg = nomAgg.get(n.id)
      return {
        nomenclature_id: n.id,
        product_code: n.product_code,
        name: n.name,
        type: n.type,
        base_unit: n.base_unit,
        quantity: agg?.quantity ?? 0,
        last_counted_at: agg?.last_counted_at ?? null,
      }
    })

    // === Detailed view (bySku) ===
    const detailedItems: SkuInventoryItem[] = (balResult.data ?? []).map((b) => {
      const sku = skuMap.get(b.sku_id)
      const nom = nomMap.get(b.nomenclature_id)
      return {
        sku_id: b.sku_id,
        sku_code: sku?.sku_code ?? '',
        nomenclature_id: b.nomenclature_id,
        product_code: nom?.product_code ?? '',
        nomenclature_name: nom?.name ?? '',
        product_name: sku?.product_name ?? '',
        brand: sku?.brand ?? null,
        barcode: sku?.barcode ?? null,
        package_weight: sku?.package_weight ?? null,
        base_unit: nom?.base_unit ?? null,
        quantity: Number(b.quantity ?? 0),
        last_counted_at: b.last_counted_at ?? null,
        last_received_at: b.last_received_at ?? null,
      }
    })

    setItems(mergedItems)
    setSkuItems(detailedItems)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchInventory()
  }, [fetchInventory])

  const upsertSkuBalance = useCallback(
    async (
      skuId: string,
      quantity: number,
    ): Promise<{ ok: boolean; error?: string }> => {
      // Get nomenclature_id from sku
      const { data: skuData, error: skuError } = await supabase
        .from('sku')
        .select('nomenclature_id')
        .eq('id', skuId)
        .single()

      if (skuError || !skuData) {
        return { ok: false, error: skuError?.message ?? 'SKU not found' }
      }

      const { error: upsertError } = await supabase
        .from('sku_balances')
        .upsert(
          {
            sku_id: skuId,
            nomenclature_id: skuData.nomenclature_id,
            quantity,
            last_counted_at: new Date().toISOString(),
          },
          { onConflict: 'sku_id' },
        )

      if (upsertError) {
        return { ok: false, error: upsertError.message }
      }
      return { ok: true }
    },
    [],
  )

  /**
   * Backward-compatible: upsert balance at nomenclature level.
   * Finds the primary SKU for the nomenclature (oldest) and updates its balance.
   * Used by ZeroDayStocktake which still works at nomenclature level.
   */
  const upsertBalance = useCallback(
    async (
      nomenclatureId: string,
      quantity: number,
    ): Promise<{ ok: boolean; error?: string }> => {
      // Find primary SKU for this nomenclature
      const { data: skus, error: skuError } = await supabase
        .from('sku')
        .select('id')
        .eq('nomenclature_id', nomenclatureId)
        .order('created_at', { ascending: true })
        .limit(1)

      if (skuError) {
        return { ok: false, error: skuError.message }
      }

      if (!skus || skus.length === 0) {
        // No SKU exists for this nomenclature — create a generic one
        const { data: nom } = await supabase
          .from('nomenclature')
          .select('name, base_unit')
          .eq('id', nomenclatureId)
          .single()

        const { data: newSku, error: createError } = await supabase
          .from('sku')
          .insert({
            nomenclature_id: nomenclatureId,
            product_name: nom?.name ?? 'Unknown',
            package_unit: nom?.base_unit ?? null,
          })
          .select('id')
          .single()

        if (createError || !newSku) {
          return { ok: false, error: createError?.message ?? 'Failed to create SKU' }
        }

        return upsertSkuBalance(newSku.id, quantity)
      }

      return upsertSkuBalance(skus[0].id, quantity)
    },
    [upsertSkuBalance],
  )

  return { items, skuItems, isLoading, error, refetch: fetchInventory, upsertBalance, upsertSkuBalance }
}
