// ═══════════════════════════════════════════════════════════
// Hook: useSupplierMapping
// Phase 6.4: Smart Mapping Engine + UoM Conversion
// ═══════════════════════════════════════════════════════════
// Looks up and saves supplier_catalog records so the
// system "remembers" user's manual nomenclature assignments.
// Lookup priority: SKU match first → fallback to name match.
// CEO rule: indexes are non-unique; sort by match_count DESC.
//
// Phase 6.4: Also loads conversion_factor, purchase_unit, base_unit
// for UoM conversion between receipt units and inventory units.
// ═══════════════════════════════════════════════════════════

import { useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { LineItem } from '../types/receipt'

interface SaveMappingParams {
  supplierId: string
  supplierSku: string | null
  originalName: string
  nomenclatureId: string
  /** Phase 6.4: Optional UoM conversion fields */
  purchaseUnit?: string
  conversionFactor?: number
  baseUnit?: string
}

/** Rich mapping data including UoM conversion and SKU info */
export interface MappingMatch {
  nomenclatureId: string
  conversionFactor: number | null
  purchaseUnit: string | null
  baseUnit: string | null
  /** Phase 10: Linked SKU id */
  skuId: string | null
  /** Phase 10: Product barcode from SKU */
  barcode: string | null
  /** Phase 10: Brand name from SKU */
  brandName: string | null
  /** Phase 10: Product name from SKU */
  productName: string | null
}

export function useSupplierMapping() {
  /**
   * Fetch all mappings for a supplier.
   * Returns a Map keyed by supplier_sku or original_name → MappingMatch.
   * For duplicate keys, the one with highest match_count wins.
   */
  const lookupMappings = useCallback(
    async (supplierId: string): Promise<Map<string, MappingMatch>> => {
      const map = new Map<string, MappingMatch>()
      if (!supplierId) return map

      const { data, error } = await supabase
        .from('supplier_catalog')
        .select('supplier_sku, original_name, nomenclature_id, match_count, conversion_factor, purchase_unit, base_unit, sku_id, sku:sku_id(barcode, brand, product_name)')
        .eq('supplier_id', supplierId)
        .order('match_count', { ascending: false })

      if (error) {
        console.error('[useSupplierMapping] lookup error:', error.message)
        return map
      }

      // Build lookup map — first occurrence wins (already sorted by match_count DESC)
      for (const row of data ?? []) {
        const skuData = row.sku as unknown as { barcode: string | null; brand: string | null; product_name: string | null } | null
        const match: MappingMatch = {
          nomenclatureId: row.nomenclature_id,
          conversionFactor: row.conversion_factor ?? null,
          purchaseUnit: row.purchase_unit ?? null,
          baseUnit: row.base_unit ?? null,
          skuId: row.sku_id ?? null,
          barcode: skuData?.barcode ?? null,
          brandName: skuData?.brand ?? null,
          productName: skuData?.product_name ?? null,
        }

        // SKU-based key (higher priority)
        if (row.supplier_sku) {
          const skuKey = `sku:${row.supplier_sku}`
          if (!map.has(skuKey)) map.set(skuKey, match)
        }
        // Name-based key (fallback)
        const nameKey = `name:${row.original_name.toLowerCase()}`
        if (!map.has(nameKey)) map.set(nameKey, match)
      }

      return map
    },
    [],
  )

  /**
   * Save (upsert) a mapping when user manually assigns a nomenclature_id.
   * If mapping already exists, increment match_count.
   * Phase 6.4: Optionally saves conversion_factor, purchase_unit, base_unit.
   */
  const saveMapping = useCallback(
    async ({ supplierId, supplierSku, originalName, nomenclatureId, purchaseUnit, conversionFactor, baseUnit }: SaveMappingParams) => {
      if (!supplierId || !nomenclatureId || !originalName) return

      // Check if mapping already exists (by SKU or by name)
      let existingId: string | null = null

      if (supplierSku) {
        const { data } = await supabase
          .from('supplier_catalog')
          .select('id, match_count')
          .eq('supplier_id', supplierId)
          .eq('supplier_sku', supplierSku)
          .eq('nomenclature_id', nomenclatureId)
          .order('match_count', { ascending: false })
          .limit(1)

        existingId = data?.[0]?.id ?? null

        if (existingId) {
          // Update match_count + optional UoM fields
          const update: Record<string, unknown> = {
            match_count: (data![0].match_count || 1) + 1,
          }
          if (purchaseUnit !== undefined) update.purchase_unit = purchaseUnit
          if (conversionFactor !== undefined) update.conversion_factor = conversionFactor
          if (baseUnit !== undefined) update.base_unit = baseUnit

          await supabase
            .from('supplier_catalog')
            .update(update)
            .eq('id', existingId)
          return
        }
      } else {
        const { data } = await supabase
          .from('supplier_catalog')
          .select('id, match_count')
          .eq('supplier_id', supplierId)
          .eq('original_name', originalName)
          .eq('nomenclature_id', nomenclatureId)
          .order('match_count', { ascending: false })
          .limit(1)

        existingId = data?.[0]?.id ?? null

        if (existingId) {
          const update: Record<string, unknown> = {
            match_count: (data![0].match_count || 1) + 1,
          }
          if (purchaseUnit !== undefined) update.purchase_unit = purchaseUnit
          if (conversionFactor !== undefined) update.conversion_factor = conversionFactor
          if (baseUnit !== undefined) update.base_unit = baseUnit

          await supabase
            .from('supplier_catalog')
            .update(update)
            .eq('id', existingId)
          return
        }
      }

      // Insert new mapping
      const { error } = await supabase.from('supplier_catalog').insert({
        supplier_id: supplierId,
        supplier_sku: supplierSku || null,
        original_name: originalName,
        nomenclature_id: nomenclatureId,
        match_count: 1,
        purchase_unit: purchaseUnit ?? null,
        conversion_factor: conversionFactor ?? null,
        base_unit: baseUnit ?? null,
      })

      if (error) {
        console.error('[useSupplierMapping] save error:', error.message)
      }
    },
    [],
  )

  /**
   * Apply saved mappings to line items.
   * For each item: try SKU match first, then name match.
   * Returns line items with auto-populated nomenclature_id where a match exists.
   */
  const applyMappings = useCallback(
    async (supplierId: string, lineItems: LineItem[]): Promise<LineItem[]> => {
      if (!supplierId || lineItems.length === 0) return lineItems

      const mappings = await lookupMappings(supplierId)
      if (mappings.size === 0) return lineItems

      return lineItems.map((li) => {
        // Already has a mapping? Don't override
        if (li.nomenclature_id) return li

        // Try SKU match first (most reliable)
        if (li.supplier_sku) {
          const skuMatch = mappings.get(`sku:${li.supplier_sku}`)
          if (skuMatch) return { ...li, nomenclature_id: skuMatch.nomenclatureId }
        }

        // Fallback: name match (case-insensitive)
        const nameMatch = mappings.get(`name:${li.original_name.toLowerCase()}`)
        if (nameMatch) return { ...li, nomenclature_id: nameMatch.nomenclatureId }

        return li
      })
    },
    [lookupMappings],
  )

  /**
   * Phase 6.5: Update conversion_factor / purchase_unit / base_unit
   * for an existing mapping (by supplier_id + nomenclature_id).
   * If no mapping exists yet, creates one with the given original_name.
   */
  const updateConversion = useCallback(
    async (params: {
      supplierId: string
      nomenclatureId: string
      originalName: string
      supplierSku?: string | null
      purchaseUnit: string
      conversionFactor: number
      baseUnit: string
    }) => {
      const { supplierId, nomenclatureId, originalName, supplierSku, purchaseUnit, conversionFactor, baseUnit } = params
      if (!supplierId || !nomenclatureId) return

      // Find existing mapping
      const { data } = await supabase
        .from('supplier_catalog')
        .select('id')
        .eq('supplier_id', supplierId)
        .eq('nomenclature_id', nomenclatureId)
        .order('match_count', { ascending: false })
        .limit(1)

      if (data && data.length > 0) {
        // Update existing
        await supabase
          .from('supplier_catalog')
          .update({ purchase_unit: purchaseUnit, conversion_factor: conversionFactor, base_unit: baseUnit })
          .eq('id', data[0].id)
      } else {
        // Create new mapping with conversion data
        await supabase.from('supplier_catalog').insert({
          supplier_id: supplierId,
          supplier_sku: supplierSku || null,
          original_name: originalName,
          nomenclature_id: nomenclatureId,
          match_count: 1,
          purchase_unit: purchaseUnit,
          conversion_factor: conversionFactor,
          base_unit: baseUnit,
        })
      }
    },
    [],
  )

  return { lookupMappings, saveMapping, applyMappings, updateConversion }
}
