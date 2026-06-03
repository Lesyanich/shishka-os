import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { AssemblyComponent, DishCardData } from './useDishCard'
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
  /** Allergen slugs derived by walking BOM tree + direct tags. SALE-* keyed. */
  allergensByDishId: Map<string, string[]>
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
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    const [dishCardRes, pfPackRes, recipeRes, compRes] = await Promise.all([
      supabase.from('dish_card').select('*'),
      supabase.from('pf_pack_card').select('*'),
      supabase
        .from('recipes_flow')
        .select('nomenclature_id, step_order, operation_name, instruction_text, is_ccp')
        .order('step_order', { ascending: true }),
      supabase.from('v_dish_assembly_components').select('*'),
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
    }>) {
      const prev = rs.get(row.nomenclature_id) ?? { step_count: 0, ccp_count: 0 }
      prev.step_count += 1
      if (row.is_ccp) prev.ccp_count += 1
      rs.set(row.nomenclature_id, prev)
      const list = steps.get(row.nomenclature_id) ?? []
      list.push({
        step_order: row.step_order,
        operation_name: row.operation_name,
        instruction_text: row.instruction_text,
      })
      steps.set(row.nomenclature_id, list)
    }
    const comps = new Map<string, AssemblyComponent[]>()
    for (const row of (compRes.data ?? []) as AssemblyComponent[]) {
      const list = comps.get(row.dish_id) ?? []
      list.push(row)
      comps.set(row.dish_id, list)
    }
    setDishCardById(dc)
    setPfPackCardById(pf)
    setRecipeStatsById(rs)
    setRecipeStepsByDish(steps)
    setComponentsByDish(comps)
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
    allergensByDishId,
    isLoading,
    error,
    refetch: fetchData,
  }
}
