import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface MenuDish {
  id: string
  name: string
  description: string | null
  product_code: string
  price: number | null
  cost_per_unit: number | null
  is_available: boolean
  is_featured: boolean
  image_url: string | null
  calories: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
  category_id: string | null
  category_name: string | null
  category_code: string | null
  display_order: number | null
  tags: MenuTag[]
}

export interface MenuTag {
  slug: string
  name: string
  tag_group: string
  color: string | null
}

export interface MenuCategory {
  id: string
  code: string
  name: string
  sort_order: number
}

export interface MenuSubcategory {
  id: string
  name: string
  parent_id: string
  sort_order: number
}

export interface UseMenuDishesResult {
  dishes: MenuDish[]
  categories: MenuCategory[]
  subcategories: Map<string, MenuSubcategory[]>
  isLoading: boolean
  error: string | null
  updateDish: (id: string, patch: Partial<Pick<MenuDish, 'name' | 'description' | 'price' | 'is_available' | 'is_featured'>>) => Promise<{ ok: boolean; error?: string }>
  refetch: () => void
}

export function useMenuDishes(): UseMenuDishesResult {
  const [dishes, setDishes] = useState<MenuDish[]>([])
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [subcategories, setSubcategories] = useState<Map<string, MenuSubcategory[]>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const [dishResult, tagResult, subcatResult] = await Promise.all([
      supabase
        .from('nomenclature')
        .select(`
          id, name, description, product_code, price, cost_per_unit,
          is_available, is_featured, image_url, display_order,
          calories, protein, carbs, fat,
          category_id,
          product_categories!category_id(id, code, name, sort_order)
        `)
        .eq('type', 'dish')
        .like('product_code', 'SALE-%')
        .order('display_order', { ascending: true }),
      supabase
        .from('nomenclature_tags')
        .select('nomenclature_id, tags(slug, name, tag_group, color)'),
      supabase
        .from('product_categories')
        .select('id, name, parent_id, sort_order')
        .not('parent_id', 'is', null)
        .order('sort_order', { ascending: true }),
    ])

    if (dishResult.error) {
      setError(dishResult.error.message)
      setIsLoading(false)
      return
    }

    // Build tag map: nomenclature_id -> tags[]
    const tagMap = new Map<string, MenuTag[]>()
    for (const row of tagResult.data ?? []) {
      const t = row.tags as unknown as MenuTag | null
      if (!t) continue
      const nid = row.nomenclature_id as string
      const arr = tagMap.get(nid) ?? []
      arr.push(t)
      tagMap.set(nid, arr)
    }

    // Build subcategory map: L1 category id -> L2 children
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

    // Collect unique categories
    const catMap = new Map<string, MenuCategory>()

    const rows: MenuDish[] = (dishResult.data ?? []).map((d) => {
      const cat = d.product_categories as unknown as { id: string; code: string; name: string; sort_order: number } | null

      if (cat && !catMap.has(cat.id)) {
        catMap.set(cat.id, { id: cat.id, code: cat.code, name: cat.name, sort_order: cat.sort_order })
      }

      return {
        id: d.id,
        name: d.name,
        description: d.description ?? null,
        product_code: d.product_code,
        price: d.price ? Number(d.price) : null,
        cost_per_unit: d.cost_per_unit ? Number(d.cost_per_unit) : null,
        is_available: d.is_available,
        is_featured: d.is_featured,
        image_url: d.image_url,
        calories: d.calories ? Number(d.calories) : null,
        protein: d.protein ? Number(d.protein) : null,
        carbs: d.carbs ? Number(d.carbs) : null,
        fat: d.fat ? Number(d.fat) : null,
        category_id: d.category_id,
        category_name: cat?.name ?? null,
        category_code: cat?.code ?? null,
        display_order: d.display_order ? Number(d.display_order) : null,
        tags: tagMap.get(d.id) ?? [],
      }
    })

    setDishes(rows)
    setCategories(
      Array.from(catMap.values()).sort((a, b) => a.sort_order - b.sort_order),
    )
    setSubcategories(subcatMap)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const updateDish = useCallback(
    async (
      id: string,
      patch: Partial<Pick<MenuDish, 'name' | 'description' | 'price' | 'is_available' | 'is_featured'>>,
    ): Promise<{ ok: boolean; error?: string }> => {
      const updates: Record<string, unknown> = {}
      if (patch.name !== undefined) updates.name = patch.name.trim()
      if (patch.description !== undefined) updates.description = patch.description?.trim() ?? null
      if (patch.price !== undefined) updates.price = patch.price
      if (patch.is_available !== undefined) updates.is_available = patch.is_available
      if (patch.is_featured !== undefined) updates.is_featured = patch.is_featured

      const { error: updateErr } = await supabase
        .from('nomenclature')
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

  return { dishes, categories, subcategories, isLoading, error, updateDish, refetch: fetchData }
}
