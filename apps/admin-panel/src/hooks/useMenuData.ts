import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type {
  MenuCategory,
  MenuDish,
  MenuSubcategory,
  MenuTag,
  PortionUnit,
  StockState,
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
  card_version: number
  last_verified_at: string | null
  last_verified_by: string | null
  pos_status: 'draft' | 'approved' | 'synced'
  /** Timestamp of the last successful push to Loyverse POS. NULL = never synced. */
  loyverse_synced_at: string | null
  /** Price Loyverse POS currently holds (last push / reconcile sweep). Compare
   * with `price` to surface a real POS drift. NULL = never pushed / unknown. */
  loyverse_price: number | null
  /** Last time this row changed in our DB. Compare against loyverse_synced_at
   * to detect drift (dish edited after its last Loyverse push). */
  updated_at: string | null
  /** Owner switch — dish is shown on the customer website (menu_public gate).
   * Decoupled from Loyverse/is_available. */
  is_web_visible: boolean
  /** Last time the dish was turned on for the web (false->true). NULL = never
   * published. Set by the DB trigger, never written from the client. */
  web_published_at: string | null
  customer_description: string | null
  customer_short_name: string | null
  customer_photo_url: string | null
  assembler_note: string | null
  kitchen_note: string | null
  ttc_source_url: string | null
  merrychef_program: Record<string, unknown> | null
  hasBom?: boolean
  /** Food-only cost (cost_per_unit minus packaging) — from v_dish_cost_split.
   * Falls back to cost_per_unit when no split row exists. SALE-* only. */
  food_cost?: number | null
  /** Packaging cost rolled into cost_per_unit (sum of NF-PKG BOM lines). */
  packaging_cost?: number | null
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
        'name' | 'description' | 'price' | 'is_available' | 'is_featured' | 'portion_size' | 'portion_unit' | 'launch_phase' | 'stock_state'
      > & { is_web_visible: boolean }
    >,
  ) => Promise<{ ok: boolean; error?: string }>
  /** Persist a new card order: writes `display_order` = position for each id. */
  reorderItems: (orderedIds: string[]) => Promise<{ ok: boolean; error?: string }>
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
  staff_code: string | null
  base_unit: string | null
  price: number | string | null
  cost_per_unit: number | string | null
  cost_source: string | null
  is_available: boolean
  is_featured: boolean
  image_url: string | null
  loyverse_item_id: string | null
  calories: number | string | null
  protein: number | string | null
  carbs: number | string | null
  fat: number | string | null
  portion_size: number | string | null
  portion_unit: PortionUnit | null
  launch_phase: number | string | null
  stock_state: string | null
  display_order: number | string | null
  category_id: string | null
  card_version: number
  last_verified_at: string | null
  last_verified_by: string | null
  pos_status: string
  loyverse_synced_at: string | null
  loyverse_price: number | string | null
  updated_at: string | null
  is_web_visible: boolean
  web_published_at: string | null
  customer_description: string | null
  customer_short_name: string | null
  customer_photo_url: string | null
  assembler_note: string | null
  kitchen_note: string | null
  ttc_source_url: string | null
  merrychef_program: Record<string, unknown> | null
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

    const [nomenResult, tagResult, subcatResult, bomResult, costSplitResult] = await Promise.all([
      supabase
        .from('nomenclature')
        .select(`
          id, name, product_code, staff_code, base_unit, price, cost_per_unit, cost_source,
          is_available, is_featured, image_url, loyverse_item_id,
          calories, protein, carbs, fat,
          portion_size, portion_unit, launch_phase, stock_state, display_order,
          category_id,
          card_version, last_verified_at, last_verified_by, pos_status, loyverse_synced_at, updated_at,
          is_web_visible, web_published_at, loyverse_price,
          customer_description, customer_short_name, customer_photo_url,
          assembler_note, kitchen_note,
          ttc_source_url, merrychef_program,
          product_categories!category_id(id, code, name, sort_order)
        `)
        .or('product_code.like.SALE-%,product_code.like.PF-%,product_code.like.MOD-%')
        .order('product_code', { ascending: true }),
      supabase
        .from('nomenclature_tags')
        .select('nomenclature_id, tags(slug, name, tag_group, color)'),
      supabase
        .from('product_categories')
        .select('id, code, name, parent_id, sort_order, is_menu_section')
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
      supabase
        .from('bom_structures')
        .select('id, parent_id, ingredient_id, quantity_per_unit, yield_loss_pct'),
      supabase
        .from('v_dish_cost_split')
        .select('dish_id, food_cost, packaging_cost'),
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

    // Category tree: index every active category so we can walk a dish up to
    // its nearest is_menu_section ancestor (the customer "section" it rolls up
    // to). A dish's own category below that section becomes a subcategory.
    interface CatRow {
      id: string
      code: string
      name: string
      parent_id: string | null
      sort_order: number
      is_menu_section: boolean
    }
    const catById = new Map<string, CatRow>()
    for (const row of subcatResult.data ?? []) {
      catById.set(row.id as string, {
        id: row.id as string,
        code: (row.code as string) ?? '',
        name: row.name as string,
        parent_id: (row.parent_id as string | null) ?? null,
        sort_order: (row.sort_order as number) ?? 0,
        is_menu_section: (row.is_menu_section as boolean) ?? false,
      })
    }

    // Nearest is_menu_section ancestor-or-self. Falls back to the category
    // itself when nothing in the chain is flagged (legacy/uncategorised).
    const sectionOf = (catId: string | null): CatRow | null => {
      let cur = catId ? catById.get(catId) ?? null : null
      const seen = new Set<string>()
      while (cur && !cur.is_menu_section) {
        if (seen.has(cur.id)) break
        seen.add(cur.id)
        cur = cur.parent_id ? catById.get(cur.parent_id) ?? null : null
      }
      return cur
    }

    // Subcategories grouped by their owning section (non-section categories
    // whose section ancestor is a different node). OwnerTable renders these as
    // subheaders under the section.
    const subcatMap = new Map<string, MenuSubcategory[]>()
    for (const c of catById.values()) {
      if (c.is_menu_section) continue
      const sec = sectionOf(c.id)
      if (!sec || sec.id === c.id) continue
      const arr = subcatMap.get(sec.id) ?? []
      arr.push({ id: c.id, name: c.name, parent_id: sec.id, sort_order: c.sort_order })
      subcatMap.set(sec.id, arr)
    }
    for (const arr of subcatMap.values()) arr.sort((a, b) => a.sort_order - b.sort_order)

    // Cost decomposition (food vs packaging) keyed by dish id (SALE-* only).
    const costSplitMap = new Map<string, { food_cost: number | null; packaging_cost: number | null }>()
    for (const row of (costSplitResult.data ?? []) as Array<{
      dish_id: string
      food_cost: number | null
      packaging_cost: number | null
    }>) {
      costSplitMap.set(row.dish_id, {
        food_cost: row.food_cost != null ? Number(row.food_cost) : null,
        packaging_cost: row.packaging_cost != null ? Number(row.packaging_cost) : null,
      })
    }

    // Build item index, categories, and a product_code→kind map
    const catMap = new Map<string, MenuCategory>()
    const itemsById = new Map<string, MenuItem>()
    const itemList: MenuItem[] = []

    for (const raw of (nomenResult.data ?? []) as unknown as RawNomenclatureRow[]) {
      const kind = kindFromCode(raw.product_code)
      if (!kind) continue
      const cat = raw.product_categories
      // Top-level menu grouping is by SECTION (umbrella), not the dish's leaf
      // category — so the tab strip / filters show "Manakish", "Drinks", etc.
      const sec = sectionOf(raw.category_id)
      if (sec && !catMap.has(sec.id)) {
        catMap.set(sec.id, { id: sec.id, code: sec.code, name: sec.name, sort_order: sec.sort_order })
      }
      const item: MenuItem = {
        id: raw.id,
        name: raw.name,
        description: null,
        product_code: raw.product_code,
        staff_code: raw.staff_code ?? null,
        base_unit: raw.base_unit,
        price: raw.price != null ? Number(raw.price) : null,
        cost_per_unit: raw.cost_per_unit != null ? Number(raw.cost_per_unit) : null,
        cost_source: (raw.cost_source as MenuItem['cost_source']) ?? 'none',
        is_available: raw.is_available,
        is_featured: raw.is_featured,
        image_url: raw.image_url,
        loyverse_item_id: raw.loyverse_item_id,
        calories: raw.calories != null ? Number(raw.calories) : null,
        protein: raw.protein != null ? Number(raw.protein) : null,
        carbs: raw.carbs != null ? Number(raw.carbs) : null,
        fat: raw.fat != null ? Number(raw.fat) : null,
        portion_size: raw.portion_size != null ? Number(raw.portion_size) : null,
        portion_unit: raw.portion_unit ?? null,
        category_id: raw.category_id,
        category_name: cat?.name ?? null,
        category_code: cat?.code ?? null,
        section_id: sec?.id ?? raw.category_id,
        display_order: raw.display_order != null ? Number(raw.display_order) : null,
        launch_phase: raw.launch_phase != null ? Number(raw.launch_phase) : 1,
        stock_state: (raw.stock_state as StockState) ?? 'in_stock',
        tags: tagMap.get(raw.id) ?? [],
        kind,
        isDualType: false,
        card_version: raw.card_version ?? 1,
        last_verified_at: raw.last_verified_at,
        last_verified_by: raw.last_verified_by,
        pos_status: (raw.pos_status ?? 'draft') as 'draft' | 'approved' | 'synced',
        loyverse_synced_at: raw.loyverse_synced_at,
        loyverse_price: raw.loyverse_price != null ? Number(raw.loyverse_price) : null,
        updated_at: raw.updated_at,
        is_web_visible: raw.is_web_visible ?? false,
        web_published_at: raw.web_published_at,
        customer_description: raw.customer_description,
        customer_short_name: raw.customer_short_name,
        customer_photo_url: raw.customer_photo_url,
        assembler_note: raw.assembler_note,
        kitchen_note: raw.kitchen_note,
        ttc_source_url: raw.ttc_source_url,
        merrychef_program: raw.merrychef_program,
        food_cost:
          costSplitMap.get(raw.id)?.food_cost ??
          (raw.cost_per_unit != null ? Number(raw.cost_per_unit) : null),
        packaging_cost: costSplitMap.get(raw.id)?.packaging_cost ?? 0,
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
          'name' | 'description' | 'price' | 'is_available' | 'is_featured' | 'portion_size' | 'portion_unit' | 'launch_phase' | 'stock_state'
        > & { is_web_visible: boolean }
      >,
    ): Promise<{ ok: boolean; error?: string }> => {
      const updates: Record<string, unknown> = {}
      if (patch.name !== undefined) updates.name = patch.name.trim()
      if (patch.price !== undefined) updates.price = patch.price
      if (patch.is_available !== undefined) updates.is_available = patch.is_available
      if (patch.is_featured !== undefined) updates.is_featured = patch.is_featured
      if (patch.portion_size !== undefined) updates.portion_size = patch.portion_size
      if (patch.portion_unit !== undefined) updates.portion_unit = patch.portion_unit
      if (patch.launch_phase !== undefined) updates.launch_phase = patch.launch_phase
      if (patch.stock_state !== undefined) updates.stock_state = patch.stock_state
      if (patch.is_web_visible !== undefined) updates.is_web_visible = patch.is_web_visible

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

  const reorderItems = useCallback(
    async (orderedIds: string[]): Promise<{ ok: boolean; error?: string }> => {
      const results = await Promise.all(
        orderedIds.map((id, idx) =>
          supabase.from('nomenclature').update({ display_order: idx }).eq('id', id),
        ),
      )
      const failed = results.find((r) => r.error)
      if (failed?.error) return { ok: false, error: failed.error.message }

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
    reorderItems,
    refetch: fetchData,
  }
}
