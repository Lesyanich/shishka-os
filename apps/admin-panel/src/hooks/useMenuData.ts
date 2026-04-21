import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type {
  MenuCategory,
  MenuDish,
  MenuSubcategory,
  MenuTag,
  PortionUnit,
} from './useMenuDishes'

export type NomenclatureKind = 'SALE' | 'PF' | 'MOD'

export interface MenuItem extends MenuDish {
  /** Derived from product_code prefix. */
  kind: NomenclatureKind
  /** True when this item is both sellable (SALE) AND consumed as a BOM
   * ingredient elsewhere — e.g. a sauce sold as a product and used inside
   * dishes. Renders with a compound half-gradient badge. */
  isDualType: boolean
  base_unit: string | null
}

export interface MenuBomChild {
  id: string
  parentId: string
  childId: string
  quantityPerUnit: number
  yieldLossPct: number | null
  child: MenuItem | null
}

export interface UseMenuDataResult {
  /** All items across SALE / PF / MOD. Sorted SALE → PF → MOD, then by name. */
  items: MenuItem[]
  /** SALE subset — backward-compat shape for OwnerGallery / CustomerPreview. */
  dishes: MenuDish[]
  categories: MenuCategory[]
  subcategories: Map<string, MenuSubcategory[]>
  /** parent_id → direct BOM children (PF + RAW + MOD, typed). */
  childrenByParent: Map<string, MenuBomChild[]>
  /** Ids of items that appear as BOM ingredient AND have SALE/sellable nature. */
  dualTypeIds: Set<string>
  isLoading: boolean
  error: string | null
  updateItem: (
    id: string,
    patch: Partial<
      Pick<
        MenuDish,
        'name' | 'description' | 'price' | 'is_available' | 'is_featured' | 'portion_size' | 'portion_unit'
      >
    >,
  ) => Promise<{ ok: boolean; error?: string }>
  refetch: () => void
}

function kindFromCode(code: string): NomenclatureKind | null {
  if (code.startsWith('SALE-')) return 'SALE'
  if (code.startsWith('PF-')) return 'PF'
  if (code.startsWith('MOD-')) return 'MOD'
  return null
}

interface RawNomenclatureRow {
  id: string
  name: string
  product_code: string
  base_unit: string | null
  price: number | string | null
  cost_per_unit: number | string | null
  is_available: boolean
  is_featured: boolean
  image_url: string | null
  calories: number | string | null
  protein: number | string | null
  carbs: number | string | null
  fat: number | string | null
  portion_size: number | string | null
  portion_unit: PortionUnit | null
  category_id: string | null
  product_categories: {
    id: string
    code: string
    name: string
    sort_order: number
  } | null
}

interface RawBomRow {
  id: string
  parent_id: string
  ingredient_id: string
  quantity_per_unit: number | string
  yield_loss_pct: number | string | null
}

export function useMenuData(): UseMenuDataResult {
  const [items, setItems] = useState<MenuItem[]>([])
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [subcategories, setSubcategories] = useState<Map<string, MenuSubcategory[]>>(new Map())
  const [childrenByParent, setChildrenByParent] = useState<Map<string, MenuBomChild[]>>(new Map())
  const [dualTypeIds, setDualTypeIds] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const [nomenResult, tagResult, subcatResult, bomResult] = await Promise.all([
      supabase
        .from('nomenclature')
        .select(`
          id, name, product_code, base_unit, price, cost_per_unit,
          is_available, is_featured, image_url,
          calories, protein, carbs, fat,
          portion_size, portion_unit,
          category_id,
          product_categories!category_id(id, code, name, sort_order)
        `)
        .or('product_code.like.SALE-%,product_code.like.PF-%,product_code.like.MOD-%')
        .order('product_code', { ascending: true }),
      supabase
        .from('nomenclature_tags')
        .select('nomenclature_id, tags(slug, name, tag_group, color)'),
      supabase
        .from('product_categories')
        .select('id, name, parent_id, sort_order')
        .not('parent_id', 'is', null)
        .order('sort_order', { ascending: true }),
      supabase
        .from('bom_structures')
        .select('id, parent_id, ingredient_id, quantity_per_unit, yield_loss_pct'),
    ])

    if (nomenResult.error) {
      setError(nomenResult.error.message)
      setIsLoading(false)
      return
    }

    const tagMap = new Map<string, MenuTag[]>()
    for (const row of tagResult.data ?? []) {
      const t = row.tags as unknown as MenuTag | null
      if (!t) continue
      const nid = row.nomenclature_id as string
      const arr = tagMap.get(nid) ?? []
      arr.push(t)
      tagMap.set(nid, arr)
    }

    const subcatMap = new Map<string, MenuSubcategory[]>()
    for (const row of subcatResult.data ?? []) {
      const parentId = row.parent_id as string
      const arr = subcatMap.get(parentId) ?? []
      arr.push({
        id: row.id as string,
        name: row.name as string,
        parent_id: parentId,
        sort_order: row.sort_order as number,
      })
      subcatMap.set(parentId, arr)
    }

    // Build item index, categories, and a product_code→kind map
    const catMap = new Map<string, MenuCategory>()
    const itemsById = new Map<string, MenuItem>()
    const itemList: MenuItem[] = []

    for (const raw of (nomenResult.data ?? []) as unknown as RawNomenclatureRow[]) {
      const kind = kindFromCode(raw.product_code)
      if (!kind) continue
      const cat = raw.product_categories
      if (cat && !catMap.has(cat.id)) {
        catMap.set(cat.id, { id: cat.id, code: cat.code, name: cat.name, sort_order: cat.sort_order })
      }
      const item: MenuItem = {
        id: raw.id,
        name: raw.name,
        description: null,
        product_code: raw.product_code,
        base_unit: raw.base_unit,
        price: raw.price != null ? Number(raw.price) : null,
        cost_per_unit: raw.cost_per_unit != null ? Number(raw.cost_per_unit) : null,
        is_available: raw.is_available,
        is_featured: raw.is_featured,
        image_url: raw.image_url,
        calories: raw.calories != null ? Number(raw.calories) : null,
        protein: raw.protein != null ? Number(raw.protein) : null,
        carbs: raw.carbs != null ? Number(raw.carbs) : null,
        fat: raw.fat != null ? Number(raw.fat) : null,
        portion_size: raw.portion_size != null ? Number(raw.portion_size) : null,
        portion_unit: raw.portion_unit ?? null,
        category_id: raw.category_id,
        category_name: cat?.name ?? null,
        category_code: cat?.code ?? null,
        display_order: null,
        tags: tagMap.get(raw.id) ?? [],
        kind,
        isDualType: false,
      }
      itemsById.set(raw.id, item)
      itemList.push(item)
    }

    // Build BOM children map; detect dual-type (item is ingredient elsewhere AND is SALE)
    const childMap = new Map<string, MenuBomChild[]>()
    const usedAsIngredient = new Set<string>()
    for (const raw of (bomResult.data ?? []) as unknown as RawBomRow[]) {
      usedAsIngredient.add(raw.ingredient_id)
      const child: MenuBomChild = {
        id: raw.id,
        parentId: raw.parent_id,
        childId: raw.ingredient_id,
        quantityPerUnit: Number(raw.quantity_per_unit),
        yieldLossPct: raw.yield_loss_pct != null ? Number(raw.yield_loss_pct) : null,
        child: itemsById.get(raw.ingredient_id) ?? null,
      }
      const arr = childMap.get(raw.parent_id) ?? []
      arr.push(child)
      childMap.set(raw.parent_id, arr)
    }

    const dualIds = new Set<string>()
    for (const item of itemList) {
      if (item.kind === 'SALE' && usedAsIngredient.has(item.id)) {
        item.isDualType = true
        dualIds.add(item.id)
      }
    }

    // Sort: SALE → PF → MOD, then by name
    const kindRank: Record<NomenclatureKind, number> = { SALE: 0, PF: 1, MOD: 2 }
    itemList.sort((a, b) => {
      const k = kindRank[a.kind] - kindRank[b.kind]
      if (k !== 0) return k
      return a.name.localeCompare(b.name)
    })

    setItems(itemList)
    setCategories(Array.from(catMap.values()).sort((a, b) => a.sort_order - b.sort_order))
    setSubcategories(subcatMap)
    setChildrenByParent(childMap)
    setDualTypeIds(dualIds)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const updateItem = useCallback(
    async (
      id: string,
      patch: Partial<
        Pick<
          MenuDish,
          'name' | 'description' | 'price' | 'is_available' | 'is_featured' | 'portion_size' | 'portion_unit'
        >
      >,
    ): Promise<{ ok: boolean; error?: string }> => {
      const updates: Record<string, unknown> = {}
      if (patch.name !== undefined) updates.name = patch.name.trim()
      if (patch.price !== undefined) updates.price = patch.price
      if (patch.is_available !== undefined) updates.is_available = patch.is_available
      if (patch.is_featured !== undefined) updates.is_featured = patch.is_featured
      if (patch.portion_size !== undefined) updates.portion_size = patch.portion_size
      if (patch.portion_unit !== undefined) updates.portion_unit = patch.portion_unit

      const { error: updateErr } = await supabase
        .from('nomenclature')
        .update(updates)
        .eq('id', id)
      if (updateErr) return { ok: false, error: updateErr.message }

      await fetchData()
      return { ok: true }
    },
    [fetchData],
  )

  const dishes = items.filter((i) => i.kind === 'SALE') as MenuDish[]

  return {
    items,
    dishes,
    categories,
    subcategories,
    childrenByParent,
    dualTypeIds,
    isLoading,
    error,
    updateItem,
    refetch: fetchData,
  }
}
