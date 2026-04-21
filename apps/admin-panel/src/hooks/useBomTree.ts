import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface BomTreeNode {
  bomRowId: string | null
  nomenclatureId: string
  productCode: string
  name: string
  type: string
  baseUnit: string | null
  costPerUnit: number
  quantityPerUnit: number
  yieldLossPct: number | null
  slot: string | null
  depth: number
  children: BomTreeNode[]
}

export interface UseBomTreeResult {
  root: BomTreeNode | null
  isLoading: boolean
  error: string | null
  refetch: () => void
}

interface RawBomRow {
  id: string
  parent_id: string
  ingredient_id: string
  quantity_per_unit: number | string
  yield_loss_pct: number | string | null
  slot: string | null
}

interface RawNomRow {
  id: string
  product_code: string
  name: string
  type: string
  base_unit: string | null
  cost_per_unit: number | string | null
}

/** Walks the BOM tree for `dishId` up to `maxDepth` levels by fetching
 * bom_structures in BFS waves, caching ingredient metadata. Client-side
 * because Supabase's PostgREST doesn't expose recursive RPC for free;
 * the tree shape is cheap for a single dish. */
export function useBomTree(dishId: string | null, maxDepth = 4): UseBomTreeResult {
  const [root, setRoot] = useState<BomTreeNode | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchTree = useCallback(async () => {
    if (!dishId) {
      setRoot(null)
      return
    }
    setIsLoading(true)
    setError(null)

    // 1) Root nomenclature
    const { data: rootData, error: rootErr } = await supabase
      .from('nomenclature')
      .select('id, product_code, name, type, base_unit, cost_per_unit')
      .eq('id', dishId)
      .maybeSingle<RawNomRow>()
    if (rootErr || !rootData) {
      setError(rootErr?.message ?? 'Dish not found')
      setRoot(null)
      setIsLoading(false)
      return
    }

    const nomById = new Map<string, RawNomRow>()
    nomById.set(rootData.id, rootData)

    // 2) BFS bom_structures wave by wave, capped at maxDepth
    const bomByParent = new Map<string, RawBomRow[]>()
    let frontier = new Set<string>([rootData.id])
    const visited = new Set<string>([rootData.id])

    for (let depth = 0; depth < maxDepth; depth++) {
      if (frontier.size === 0) break
      const { data: bomRows, error: bomErr } = await supabase
        .from('bom_structures')
        .select('id, parent_id, ingredient_id, quantity_per_unit, yield_loss_pct, slot')
        .in('parent_id', Array.from(frontier))
      if (bomErr) {
        setError(bomErr.message)
        setRoot(null)
        setIsLoading(false)
        return
      }
      const typed = (bomRows ?? []) as RawBomRow[]
      for (const row of typed) {
        const arr = bomByParent.get(row.parent_id) ?? []
        arr.push(row)
        bomByParent.set(row.parent_id, arr)
      }
      const childIds = new Set<string>()
      for (const row of typed) {
        if (!visited.has(row.ingredient_id)) childIds.add(row.ingredient_id)
      }
      if (childIds.size === 0) break
      // Fetch nomenclature metadata for the new children
      const { data: nomRows, error: nomErr } = await supabase
        .from('nomenclature')
        .select('id, product_code, name, type, base_unit, cost_per_unit')
        .in('id', Array.from(childIds))
      if (nomErr) {
        setError(nomErr.message)
        setRoot(null)
        setIsLoading(false)
        return
      }
      for (const n of (nomRows ?? []) as RawNomRow[]) {
        nomById.set(n.id, n)
        visited.add(n.id)
      }
      frontier = childIds
    }

    // 3) Build tree recursively
    const build = (
      nomId: string,
      bomRow: RawBomRow | null,
      depth: number,
    ): BomTreeNode | null => {
      const n = nomById.get(nomId)
      if (!n) return null
      const children: BomTreeNode[] = []
      if (depth < maxDepth) {
        for (const row of bomByParent.get(nomId) ?? []) {
          const child = build(row.ingredient_id, row, depth + 1)
          if (child) children.push(child)
        }
      }
      return {
        bomRowId: bomRow?.id ?? null,
        nomenclatureId: n.id,
        productCode: n.product_code,
        name: n.name,
        type: n.type,
        baseUnit: n.base_unit,
        costPerUnit: n.cost_per_unit != null ? Number(n.cost_per_unit) : 0,
        quantityPerUnit: bomRow ? Number(bomRow.quantity_per_unit) : 1,
        yieldLossPct: bomRow?.yield_loss_pct != null ? Number(bomRow.yield_loss_pct) : null,
        slot: bomRow?.slot ?? null,
        depth,
        children,
      }
    }

    setRoot(build(rootData.id, null, 0))
    setIsLoading(false)
  }, [dishId, maxDepth])

  useEffect(() => {
    fetchTree()
  }, [fetchTree])

  return { root, isLoading, error, refetch: fetchTree }
}
