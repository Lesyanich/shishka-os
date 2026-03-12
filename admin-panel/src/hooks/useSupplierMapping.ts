// ═══════════════════════════════════════════════════════════
// Hook: useSupplierMapping
// Phase 4.6: Smart Mapping Engine
// ═══════════════════════════════════════════════════════════
// Looks up and saves supplier_item_mapping records so the
// system "remembers" user's manual nomenclature assignments.
// Lookup priority: SKU match first → fallback to name match.
// CEO rule: indexes are non-unique; sort by match_count DESC.
// ═══════════════════════════════════════════════════════════

import { useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { LineItem } from '../types/receipt'

interface SaveMappingParams {
  supplierId: string
  supplierSku: string | null
  originalName: string
  nomenclatureId: string
}

export function useSupplierMapping() {
  /**
   * Fetch all mappings for a supplier.
   * Returns a Map keyed by supplier_sku (preferred) or original_name → nomenclature_id.
   * For duplicate keys, the one with highest match_count wins.
   */
  const lookupMappings = useCallback(
    async (supplierId: string): Promise<Map<string, string>> => {
      const map = new Map<string, string>()
      if (!supplierId) return map

      const { data, error } = await supabase
        .from('supplier_item_mapping')
        .select('supplier_sku, original_name, nomenclature_id, match_count')
        .eq('supplier_id', supplierId)
        .order('match_count', { ascending: false })

      if (error) {
        console.error('[useSupplierMapping] lookup error:', error.message)
        return map
      }

      // Build lookup map — first occurrence wins (already sorted by match_count DESC)
      for (const row of data ?? []) {
        // SKU-based key (higher priority)
        if (row.supplier_sku) {
          const skuKey = `sku:${row.supplier_sku}`
          if (!map.has(skuKey)) map.set(skuKey, row.nomenclature_id)
        }
        // Name-based key (fallback)
        const nameKey = `name:${row.original_name.toLowerCase()}`
        if (!map.has(nameKey)) map.set(nameKey, row.nomenclature_id)
      }

      return map
    },
    [],
  )

  /**
   * Save (upsert) a mapping when user manually assigns a nomenclature_id.
   * If mapping already exists, increment match_count.
   */
  const saveMapping = useCallback(
    async ({ supplierId, supplierSku, originalName, nomenclatureId }: SaveMappingParams) => {
      if (!supplierId || !nomenclatureId || !originalName) return

      // Check if mapping already exists (by SKU or by name)
      let existingId: string | null = null

      if (supplierSku) {
        const { data } = await supabase
          .from('supplier_item_mapping')
          .select('id, match_count')
          .eq('supplier_id', supplierId)
          .eq('supplier_sku', supplierSku)
          .eq('nomenclature_id', nomenclatureId)
          .order('match_count', { ascending: false })
          .limit(1)

        existingId = data?.[0]?.id ?? null

        if (existingId) {
          // Update match_count
          await supabase
            .from('supplier_item_mapping')
            .update({ match_count: (data![0].match_count || 1) + 1 })
            .eq('id', existingId)
          return
        }
      } else {
        const { data } = await supabase
          .from('supplier_item_mapping')
          .select('id, match_count')
          .eq('supplier_id', supplierId)
          .eq('original_name', originalName)
          .eq('nomenclature_id', nomenclatureId)
          .order('match_count', { ascending: false })
          .limit(1)

        existingId = data?.[0]?.id ?? null

        if (existingId) {
          await supabase
            .from('supplier_item_mapping')
            .update({ match_count: (data![0].match_count || 1) + 1 })
            .eq('id', existingId)
          return
        }
      }

      // Insert new mapping
      const { error } = await supabase.from('supplier_item_mapping').insert({
        supplier_id: supplierId,
        supplier_sku: supplierSku || null,
        original_name: originalName,
        nomenclature_id: nomenclatureId,
        match_count: 1,
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
          if (skuMatch) return { ...li, nomenclature_id: skuMatch }
        }

        // Fallback: name match (case-insensitive)
        const nameMatch = mappings.get(`name:${li.original_name.toLowerCase()}`)
        if (nameMatch) return { ...li, nomenclature_id: nameMatch }

        return li
      })
    },
    [lookupMappings],
  )

  return { lookupMappings, saveMapping, applyMappings }
}
