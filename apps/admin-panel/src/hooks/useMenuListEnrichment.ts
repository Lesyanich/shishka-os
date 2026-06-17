import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { AssemblyComponent, DishCardData, DishPackagingLine } from './useDishCard'
import type { PfPackCardData } from './usePfPackCard'
import type { MenuBomChild, MenuItem } from './useMenuData'

export interface RecipeStepStats {
  step_count: number
  ccp_count: number
}

/** Lightweight recipe step for inline list display (L2 Assembler grid). */
export interface MenuRecipeStep {
  step_order: number
  operation_name: string
  instruction_text: string | null
  /** Short station label for this step: 'L1' (Kitchen prep) | 'L2' (Assembly) | zone name. */
  location: string | null
  /** Raw locations.type enum ('kitchen' | 'storage' | 'assembly' | null) —
   *  rename-proof key for station bucketing (see lib/recipeStation.ts). */
  location_type: string | null
}

/** Map a locations.name (functional zone) to the station label cooks use. */
function stationLabel(name: string | null | undefined): string | null {
  if (!name) return null
  if (name === 'Kitchen') return 'L1'
  if (name === 'Assembly') return 'L2'
  return name
}

/** A dish customisation option (from v_dish_modifier_options), ordered. */
export interface DishModifierOption {
  dish_id: string
  group_name: string | null
  modifier_name: string
  modifier_short_name: string | null
  modifier_emoji: string | null
  price_delta: number | null
  is_default: boolean
  /** Stock state of the underlying modifier (mig 249). 'coming_soon' /
   *  'out_of_stock' render the option greyed / badged in the picker. */
  modifier_stock_state: 'in_stock' | 'coming_soon' | 'out_of_stock'
  /** Per-portion nutrition (nomenclature × quantity_per_unit), for the live
   *  KBJU build-preview. mig 261/262. */
  calories: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
  /** Required min / max picks for the option's group (mig 262). null = unbounded. */
  group_min_select: number | null
  group_max_select: number | null
}

export interface UseMenuListEnrichmentResult {
  /** dish_card row keyed by nomenclature_id (SALE-* only). */
  dishCardById: Map<string, DishCardData>
  /** pf_pack_card row keyed by nomenclature_id (PF-* only). */
  pfPackCardById: Map<string, PfPackCardData>
  /** Recipe step + HACCP CCP stats per nomenclature (SALE + PF). */
  recipeStatsById: Map<string, RecipeStepStats>
  /** L2 assembly components keyed by dish_id (SALE-* only, from v_dish_assembly_components). */
  componentsByDish: Map<string, AssemblyComponent[]>
  /** Recipe steps (ordered) keyed by nomenclature_id — for inline process display. */
  recipeStepsByDish: Map<string, MenuRecipeStep[]>
  /** Customisation options (ordered) keyed by dish_id — from v_dish_modifier_options. */
  modifierOptionsByDish: Map<string, DishModifierOption[]>
  /** Allergen slugs derived by walking BOM tree + direct tags. SALE-* keyed. */
  allergensByDishId: Map<string, string[]>
  /** Packaging lines (NF-PKG BOM components) keyed by dish id. SALE-* only. */
  packagingByDish: Map<string, DishPackagingLine[]>
  isLoading: boolean
  error: string | null
  refetch: () => void
}

/** Single-call enrichment for menu list views.
 *
 * - dish_card / pf_pack_card: bulk SELECT keyed by nomenclature_id
 * - recipes_flow: aggregate step / CCP counts via grouped SELECT
 * - allergens: computed client-side from items + BOM + tags (cheap O(n·depth))
 *
 * Mutates inputs are NOT supported — re-fetch on save by calling refetch().
 */
export function useMenuListEnrichment(
  items: MenuItem[],
  childrenByParent: Map<string, MenuBomChild[]>,
): UseMenuListEnrichmentResult {
  const [dishCardById, setDishCardById] = useState<Map<string, DishCardData>>(
    new Map(),
  )
  const [pfPackCardById, setPfPackCardById] = useState<
    Map<string, PfPackCardData>
  >(new Map())
  const [recipeStatsById, setRecipeStatsById] = useState<
    Map<string, RecipeStepStats>
  >(new Map())
  const [componentsByDish, setComponentsByDish] = useState<
    Map<string, AssemblyComponent[]>
  >(new Map())
  const [recipeStepsByDish, setRecipeStepsByDish] = useState<
    Map<string, MenuRecipeStep[]>
  >(new Map())
  const [modifierOptionsByDish, setModifierOptionsByDish] = useState<
    Map<string, DishModifierOption[]>
  >(new Map())
  const [packagingByDish, setPackagingByDish] = useState<
    Map<string, DishPackagingLine[]>
  >(new Map())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    const [dishCardRes, pfPackRes, recipeRes, compRes, modRes, pkgRes] = await Promise.all([
      supabase.from('dish_card').select('*'),
      supabase.from('pf_pack_card').select('*'),
      supabase
        .from('recipes_flow')
        .select(
          'nomenclature_id, step_order, operation_name, instruction_text, is_ccp, location:locations(name, type)',
        )
        .order('step_order', { ascending: true }),
      supabase.from('v_dish_assembly_components').select('*'),
      supabase.from('v_dish_modifier_options').select('*'),
      supabase.from('v_dish_packaging').select('*'),
    ])
    if (dishCardRes.error) {
      setError(dishCardRes.error.message)
      setIsLoading(false)
      return
    }
    if (pfPackRes.error) {
      setError(pfPackRes.error.message)
      setIsLoading(false)
      return
    }
    if (recipeRes.error) {
      setError(recipeRes.error.message)
      setIsLoading(false)
      return
    }
    if (compRes.error) {
      setError(compRes.error.message)
      setIsLoading(false)
      return
    }
    if (modRes.error) {
      setError(modRes.error.message)
      setIsLoading(false)
      return
    }
    if (pkgRes.error) {
      setError(pkgRes.error.message)
      setIsLoading(false)
      return
    }
    const dc = new Map<string, DishCardData>()
    for (const row of (dishCardRes.data ?? []) as DishCardData[]) {
      dc.set(row.nomenclature_id, row)
    }
    const pf = new Map<string, PfPackCardData>()
    for (const row of (pfPackRes.data ?? []) as PfPackCardData[]) {
      pf.set(row.nomenclature_id, row)
    }
    const rs = new Map<string, RecipeStepStats>()
    const steps = new Map<string, MenuRecipeStep[]>()
    for (const row of (recipeRes.data ?? []) as Array<{
      nomenclature_id: string
      step_order: number
      operation_name: string
      instruction_text: string | null
      is_ccp: boolean
      location:
        | { name: string | null; type: string | null }
        | { name: string | null; type: string | null }[]
        | null
    }>) {
      const prev = rs.get(row.nomenclature_id) ?? { step_count: 0, ccp_count: 0 }
      prev.step_count += 1
      if (row.is_ccp) prev.ccp_count += 1
      rs.set(row.nomenclature_id, prev)
      const list = steps.get(row.nomenclature_id) ?? []
      const loc = Array.isArray(row.location) ? row.location[0] : row.location
      list.push({
        step_order: row.step_order,
        operation_name: row.operation_name,
        instruction_text: row.instruction_text,
        location: stationLabel(loc?.name),
        location_type: loc?.type ?? null,
      })
      steps.set(row.nomenclature_id, list)
    }
    const comps = new Map<string, AssemblyComponent[]>()
    for (const row of (compRes.data ?? []) as AssemblyComponent[]) {
      const list = comps.get(row.dish_id) ?? []
      list.push(row)
      comps.set(row.dish_id, list)
    }
    const mods = new Map<string, DishModifierOption[]>()
    // Postgres numeric columns can arrive as strings; widen them so Number(...) is sound.
    for (const row of (modRes.data ?? []) as Array<
      Omit<DishModifierOption, 'price_delta' | 'protein' | 'carbs' | 'fat'> & {
        price_delta: number | string | null
        protein: number | string | null
        carbs: number | string | null
        fat: number | string | null
      }
    >) {
      const list = mods.get(row.dish_id) ?? []
      list.push({
        dish_id: row.dish_id,
        group_name: row.group_name,
        modifier_name: row.modifier_name,
        modifier_short_name: row.modifier_short_name,
        modifier_emoji: row.modifier_emoji,
        price_delta: row.price_delta != null ? Number(row.price_delta) : null,
        is_default: !!row.is_default,
        modifier_stock_state: row.modifier_stock_state ?? 'in_stock',
        calories: row.calories != null ? Number(row.calories) : null,
        protein: row.protein != null ? Number(row.protein) : null,
        carbs: row.carbs != null ? Number(row.carbs) : null,
        fat: row.fat != null ? Number(row.fat) : null,
        group_min_select: row.group_min_select != null ? Number(row.group_min_select) : null,
        group_max_select: row.group_max_select != null ? Number(row.group_max_select) : null,
      })
      mods.set(row.dish_id, list)
    }
    const pkg = new Map<string, DishPackagingLine[]>()
    for (const row of (pkgRes.data ?? []) as DishPackagingLine[]) {
      const list = pkg.get(row.dish_id) ?? []
      list.push(row)
      pkg.set(row.dish_id, list)
    }
    setDishCardById(dc)
    setPfPackCardById(pf)
    setRecipeStatsById(rs)
    setRecipeStepsByDish(steps)
    setComponentsByDish(comps)
    setModifierOptionsByDish(mods)
    setPackagingByDish(pkg)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Allergens — walk BOM tree client-side.
  // For each SALE dish, recursively collect allergen tags from itself + all descendants.
  const allergensByDishId = useMemo(() => {
    const out = new Map<string, string[]>()
    const tagsById = new Map<string, string[]>()
    for (const item of items) {
      const slugs = item.tags
        .filter((t) => t.tag_group === 'allergen')
        .map((t) => t.slug)
      if (slugs.length > 0) tagsById.set(item.id, slugs)
    }
    function collect(id: string, seen: Set<string>): Set<string> {
      const out = new Set<string>()
      if (seen.has(id)) return out
      seen.add(id)
      const self = tagsById.get(id) ?? []
      for (const s of self) out.add(s)
      for (const child of childrenByParent.get(id) ?? []) {
        const sub = collect(child.childId, seen)
        for (const s of sub) out.add(s)
      }
      return out
    }
    for (const item of items) {
      if (item.kind !== 'SALE') continue
      const allergens = Array.from(collect(item.id, new Set())).sort()
      out.set(item.id, allergens)
    }
    return out
  }, [items, childrenByParent])

  return {
    dishCardById,
    pfPackCardById,
    recipeStatsById,
    componentsByDish,
    recipeStepsByDish,
    modifierOptionsByDish,
    allergensByDishId,
    packagingByDish,
    isLoading,
    error,
    refetch: fetchData,
  }
}
