// ═══════════════════════════════════════════════════════════
// Hook: useSkuManager
// Phase 10.2: CRUD operations for SKU management page
// Fetches sku table with nomenclature join + stock + supplier count
// ═══════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface SkuRow {
  id: string
  sku_code: string
  nomenclature_id: string
  nomenclature_name: string
  nomenclature_type: string
  barcode: string | null
  product_name: string
  product_name_th: string | null
  brand: string | null
  brand_id: string | null
  package_weight: string | null
  package_qty: number | null
  package_unit: string | null
  package_type: string | null
  is_active: boolean
  stock_quantity: number
  supplier_count: number
  created_at: string
}

export interface SkuFormData {
  product_name: string
  product_name_th?: string | null
  barcode?: string | null
  nomenclature_id: string
  brand?: string | null
  brand_id?: string | null
  package_weight?: string | null
  package_qty?: number | null
  package_unit?: string | null
  package_type?: string | null
}

export interface NomenclatureOption {
  id: string
  product_code: string
  name: string
  type: string
  base_unit: string | null
}

export interface SkuStats {
  total: number
  withBarcode: number
  withSupplier: number
  inactive: number
}

export interface UseSkuManagerResult {
  skus: SkuRow[]
  nomenclatureOptions: NomenclatureOption[]
  stats: SkuStats
  isLoading: boolean
  error: string | null
  refetch: () => void
  createSku: (data: SkuFormData) => Promise<{ ok: boolean; error?: string }>
  updateSku: (id: string, data: Partial<SkuFormData>) => Promise<{ ok: boolean; error?: string }>
  deactivateSku: (id: string) => Promise<{ ok: boolean; error?: string }>
}

export function useSkuManager(): UseSkuManagerResult {
  const [skus, setSkus] = useState<SkuRow[]>([])
  const [nomenclatureOptions, setNomenclatureOptions] = useState<NomenclatureOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const [skuResult, nomResult, balResult, scResult] = await Promise.all([
      // All SKUs with nomenclature join
      supabase
        .from('sku')
        .select('id, sku_code, nomenclature_id, barcode, product_name, product_name_th, brand, brand_id, package_weight, package_qty, package_unit, package_type, is_active, created_at, nomenclature:nomenclature_id(name, type)')
        .order('created_at', { ascending: false }),
      // Nomenclature options for dropdown
      supabase
        .from('nomenclature')
        .select('id, product_code, name, type, base_unit')
        .in('type', ['good', 'dish'])
        .order('name', { ascending: true }),
      // Stock balances
      supabase
        .from('sku_balances')
        .select('sku_id, quantity'),
      // Supplier catalog counts
      supabase
        .from('supplier_catalog')
        .select('sku_id'),
    ])

    if (skuResult.error) {
      setError(skuResult.error.message)
      setIsLoading(false)
      return
    }

    // Build stock map
    const stockMap = new Map<string, number>()
    for (const b of balResult.data ?? []) {
      stockMap.set(b.sku_id, Number(b.quantity ?? 0))
    }

    // Build supplier count map
    const supplierCountMap = new Map<string, number>()
    for (const sc of scResult.data ?? []) {
      if (sc.sku_id) {
        supplierCountMap.set(sc.sku_id, (supplierCountMap.get(sc.sku_id) ?? 0) + 1)
      }
    }

    // Merge into SkuRow[]
    const rows: SkuRow[] = (skuResult.data ?? []).map((s) => {
      const nom = s.nomenclature as unknown as { name: string; type: string } | null
      return {
        id: s.id,
        sku_code: s.sku_code,
        nomenclature_id: s.nomenclature_id,
        nomenclature_name: nom?.name ?? '',
        nomenclature_type: nom?.type ?? '',
        barcode: s.barcode,
        product_name: s.product_name,
        product_name_th: s.product_name_th,
        brand: s.brand,
        brand_id: s.brand_id,
        package_weight: s.package_weight,
        package_qty: s.package_qty ? Number(s.package_qty) : null,
        package_unit: s.package_unit,
        package_type: s.package_type,
        is_active: s.is_active,
        stock_quantity: stockMap.get(s.id) ?? 0,
        supplier_count: supplierCountMap.get(s.id) ?? 0,
        created_at: s.created_at,
      }
    })

    setSkus(rows)
    setNomenclatureOptions((nomResult.data ?? []) as NomenclatureOption[])
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const createSku = useCallback(
    async (data: SkuFormData): Promise<{ ok: boolean; error?: string }> => {
      const { error: insertErr } = await supabase.from('sku').insert({
        // sku_code: null → trigger fn_sku_set_code will auto-assign
        nomenclature_id: data.nomenclature_id,
        product_name: data.product_name.trim(),
        product_name_th: data.product_name_th?.trim() || null,
        barcode: data.barcode?.trim() || null,
        brand: data.brand?.trim() || null,
        brand_id: data.brand_id || null,
        package_weight: data.package_weight?.trim() || null,
        package_qty: data.package_qty ?? null,
        package_unit: data.package_unit?.trim() || null,
        package_type: data.package_type?.trim() || null,
      })

      if (insertErr) {
        return { ok: false, error: insertErr.message }
      }

      await fetchData()
      return { ok: true }
    },
    [fetchData],
  )

  const updateSku = useCallback(
    async (
      id: string,
      data: Partial<SkuFormData>,
    ): Promise<{ ok: boolean; error?: string }> => {
      const updates: Record<string, unknown> = {}
      if (data.product_name !== undefined) updates.product_name = data.product_name.trim()
      if (data.product_name_th !== undefined) updates.product_name_th = data.product_name_th?.trim() || null
      if (data.barcode !== undefined) updates.barcode = data.barcode?.trim() || null
      if (data.nomenclature_id !== undefined) updates.nomenclature_id = data.nomenclature_id
      if (data.brand !== undefined) updates.brand = data.brand?.trim() || null
      if (data.brand_id !== undefined) updates.brand_id = data.brand_id || null
      if (data.package_weight !== undefined) updates.package_weight = data.package_weight?.trim() || null
      if (data.package_qty !== undefined) updates.package_qty = data.package_qty ?? null
      if (data.package_unit !== undefined) updates.package_unit = data.package_unit?.trim() || null
      if (data.package_type !== undefined) updates.package_type = data.package_type?.trim() || null

      const { error: updateErr } = await supabase
        .from('sku')
        .update(updates)
        .eq('id', id)

      if (updateErr) {
        return { ok: false, error: updateErr.message }
      }

      await fetchData()
      return { ok: true }
    },
    [fetchData],
  )

  const deactivateSku = useCallback(
    async (id: string): Promise<{ ok: boolean; error?: string }> => {
      const { error: updateErr } = await supabase
        .from('sku')
        .update({ is_active: false })
        .eq('id', id)

      if (updateErr) {
        return { ok: false, error: updateErr.message }
      }

      await fetchData()
      return { ok: true }
    },
    [fetchData],
  )

  // Compute stats
  const stats: SkuStats = {
    total: skus.length,
    withBarcode: skus.filter((s) => s.barcode).length,
    withSupplier: skus.filter((s) => s.supplier_count > 0).length,
    inactive: skus.filter((s) => !s.is_active).length,
  }

  return {
    skus,
    nomenclatureOptions,
    stats,
    isLoading,
    error,
    refetch: fetchData,
    createSku,
    updateSku,
    deactivateSku,
  }
}
