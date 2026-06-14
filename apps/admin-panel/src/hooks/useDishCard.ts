import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { NF_PKG_CODE_PREFIX } from '../lib/packaging'

export interface DishCardData {
  nomenclature_id: string
  container_l2: string | null
  assembly_order: { step: number; text: string }[] | null
  pre_merrychef_prep: string | null
  post_merrychef_check: string | null
  cold_addons_after_reheat: string | null
  has_cutlery: boolean
  has_lid_sticker: boolean
  assembler_photo_url: string | null
  customer_eta_min: number | null
  composition_override: string | null
}

export interface AssemblyComponent {
  dish_id: string
  component_id: string
  component_code: string
  component_name: string
  /** Clean culinary label (nomenclature.customer_short_name); null → fall back to component_name. */
  component_short_name: string | null
  /** Ingredient emoji (nomenclature.emoji); null → no prefix. */
  component_emoji: string | null
  component_type: string
  qty_per_portion: number
  base_unit: string | null
  slot: string | null
  notes: string | null
}

/** A packaging line attached to a dish (v_dish_packaging row). */
export interface DishPackagingLine {
  bom_id: string
  dish_id: string
  packaging_id: string
  packaging_code: string
  packaging_name: string
  packaging_short_name: string | null
  packaging_emoji: string | null
  qty_per_portion: number
  base_unit: string | null
  cost_per_unit: number | null
  line_cost: number | null
}

/** A selectable packaging material from the NF-PKG catalog. */
export interface PackagingCatalogItem {
  id: string
  name: string
  cost_per_unit: number | null
  base_unit: string | null
}

export interface UseDishCardResult {
  card: DishCardData | null
  components: AssemblyComponent[]
  /** Packaging lines (NF-PKG BOM components) for this dish. */
  packaging: DishPackagingLine[]
  /** NF-PKG catalog for the packaging picker. */
  packagingCatalog: PackagingCatalogItem[]
  /** Attach a packaging material as a BOM line. */
  addPackaging: (packagingId: string, qty: number) => Promise<{ ok: boolean; error?: string }>
  /** Change qty on an existing packaging line. */
  updatePackagingQty: (bomId: string, qty: number) => Promise<{ ok: boolean; error?: string }>
  /** Remove a packaging line. */
  removePackaging: (bomId: string) => Promise<{ ok: boolean; error?: string }>
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useDishCard(dishId: string | null): UseDishCardResult {
  const [card, setCard] = useState<DishCardData | null>(null)
  const [components, setComponents] = useState<AssemblyComponent[]>([])
  const [packaging, setPackaging] = useState<DishPackagingLine[]>([])
  const [packagingCatalog, setPackagingCatalog] = useState<PackagingCatalogItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!dishId) {
      setCard(null)
      setComponents([])
      setPackaging([])
      return
    }
    setIsLoading(true)
    setError(null)

    const [cardRes, compRes, pkgRes, catalogRes] = await Promise.all([
      supabase
        .from('dish_card')
        .select('*')
        .eq('nomenclature_id', dishId)
        .maybeSingle(),
      supabase
        .from('v_dish_assembly_components')
        .select('*')
        .eq('dish_id', dishId),
      supabase
        .from('v_dish_packaging')
        .select('*')
        .eq('dish_id', dishId),
      supabase
        .from('nomenclature')
        .select('id, name, cost_per_unit, base_unit, product_categories!category_id!inner(code)')
        .like('product_categories.code', `${NF_PKG_CODE_PREFIX}%`)
        .order('name', { ascending: true }),
    ])

    if (cardRes.error) {
      setError(cardRes.error.message)
      setIsLoading(false)
      return
    }
    if (compRes.error) {
      setError(compRes.error.message)
      setIsLoading(false)
      return
    }
    if (pkgRes.error) {
      setError(pkgRes.error.message)
      setIsLoading(false)
      return
    }

    setCard(cardRes.data as DishCardData | null)
    setComponents((compRes.data ?? []) as AssemblyComponent[])
    setPackaging((pkgRes.data ?? []) as DishPackagingLine[])
    setPackagingCatalog((catalogRes.data ?? []) as PackagingCatalogItem[])
    setIsLoading(false)
  }, [dishId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const addPackaging = useCallback(
    async (packagingId: string, qty: number) => {
      if (!dishId) return { ok: false, error: 'No dish selected' }
      const { error: err } = await supabase.from('bom_structures').insert({
        parent_id: dishId,
        ingredient_id: packagingId,
        quantity_per_unit: qty,
      })
      if (err) return { ok: false, error: err.message }
      await fetchData()
      return { ok: true }
    },
    [dishId, fetchData],
  )

  const updatePackagingQty = useCallback(
    async (bomId: string, qty: number) => {
      const { error: err } = await supabase
        .from('bom_structures')
        .update({ quantity_per_unit: qty })
        .eq('id', bomId)
      if (err) return { ok: false, error: err.message }
      await fetchData()
      return { ok: true }
    },
    [fetchData],
  )

  const removePackaging = useCallback(
    async (bomId: string) => {
      const { error: err } = await supabase
        .from('bom_structures')
        .delete()
        .eq('id', bomId)
      if (err) return { ok: false, error: err.message }
      await fetchData()
      return { ok: true }
    },
    [fetchData],
  )

  return {
    card,
    components,
    packaging,
    packagingCatalog,
    addPackaging,
    updatePackagingQty,
    removePackaging,
    isLoading,
    error,
    refetch: fetchData,
  }
}
