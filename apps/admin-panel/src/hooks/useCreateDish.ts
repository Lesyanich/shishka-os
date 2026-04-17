import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// ─── Cyrillic → Latin slug generator (mirrors RecipeBuilder) ───

const CYRILLIC_MAP: Record<string, string> = {
  '\u0430': 'a', '\u0431': 'b', '\u0432': 'v', '\u0433': 'g',
  '\u0434': 'd', '\u0435': 'e', '\u0451': 'yo', '\u0436': 'zh',
  '\u0437': 'z', '\u0438': 'i', '\u0439': 'y', '\u043a': 'k',
  '\u043b': 'l', '\u043c': 'm', '\u043d': 'n', '\u043e': 'o',
  '\u043f': 'p', '\u0440': 'r', '\u0441': 's', '\u0442': 't',
  '\u0443': 'u', '\u0444': 'f', '\u0445': 'kh', '\u0446': 'ts',
  '\u0447': 'ch', '\u0448': 'sh', '\u0449': 'shch', '\u044a': '',
  '\u044b': 'y', '\u044c': '', '\u044d': 'e', '\u044e': 'yu',
  '\u044f': 'ya',
}

/** Convert name to SALE-STYLE product code: "Борщ Bio-Active" → "SALE-BORSCH_BIO_ACTIVE" */
export function productCodeFromName(name: string): string {
  const slug = name
    .toLowerCase()
    .split('')
    .map((c) => CYRILLIC_MAP[c] ?? c)
    .join('')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
  return slug ? `SALE-${slug.toUpperCase()}` : 'SALE-'
}

// ─── Types ──────────────────────────────────────────────────

export interface CategoryOption {
  id: string
  code: string | null
  name: string
  parent_id: string | null
  sort_order: number
}

export type PortionUnit = 'g' | 'ml' | 'pcs'

export interface CreateDishInput {
  name: string
  product_code: string
  category_id: string | null
  price: number | null
  is_available: boolean
  is_featured: boolean
  portion_size: number | null
  portion_unit: PortionUnit | null
}

export interface UseCreateDishResult {
  categories: CategoryOption[] // L1 (parent_id IS NULL)
  subcategories: Map<string, CategoryOption[]> // parent_id -> [L2]
  isLoadingCategories: boolean
  isCreating: boolean
  error: string | null
  /** Returns {ok, id, error}. On success, caller should refetch menu list. */
  createDish: (
    input: CreateDishInput,
  ) => Promise<{ ok: boolean; id?: string; error?: string }>
  /** Returns true if product_code is already in use. */
  isCodeTaken: (code: string) => Promise<boolean>
}

// ─── Hook ───────────────────────────────────────────────────

export function useCreateDish(): UseCreateDishResult {
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [subcategories, setSubcategories] = useState<Map<string, CategoryOption[]>>(
    new Map(),
  )
  const [isLoadingCategories, setIsLoadingCategories] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const fetchCategories = async () => {
      setIsLoadingCategories(true)
      const { data, error: fetchError } = await supabase
        .from('product_categories')
        .select('id, code, name, parent_id, sort_order')
        .order('sort_order', { ascending: true })

      if (cancelled) return

      if (fetchError) {
        setError(`Failed to load categories: ${fetchError.message}`)
        setIsLoadingCategories(false)
        return
      }

      const l1: CategoryOption[] = []
      const l2Map = new Map<string, CategoryOption[]>()

      for (const row of data ?? []) {
        const cat: CategoryOption = {
          id: row.id as string,
          code: (row.code as string | null) ?? null,
          name: row.name as string,
          parent_id: (row.parent_id as string | null) ?? null,
          sort_order: (row.sort_order as number) ?? 0,
        }
        if (cat.parent_id === null) {
          l1.push(cat)
        } else {
          const arr = l2Map.get(cat.parent_id) ?? []
          arr.push(cat)
          l2Map.set(cat.parent_id, arr)
        }
      }

      setCategories(l1)
      setSubcategories(l2Map)
      setIsLoadingCategories(false)
    }

    fetchCategories()

    return () => {
      cancelled = true
    }
  }, [])

  const isCodeTaken = useCallback(async (code: string): Promise<boolean> => {
    const { data, error: fetchError } = await supabase
      .from('nomenclature')
      .select('id')
      .eq('product_code', code)
      .maybeSingle()

    if (fetchError) {
      console.error('[useCreateDish] isCodeTaken error', fetchError)
      return false // best-effort; let DB unique constraint catch duplicates
    }
    return data !== null
  }, [])

  const createDish = useCallback(
    async (
      input: CreateDishInput,
    ): Promise<{ ok: boolean; id?: string; error?: string }> => {
      setIsCreating(true)
      setError(null)

      // Guard: check uniqueness of product_code (pre-insert, for friendly message)
      const taken = await isCodeTaken(input.product_code)
      if (taken) {
        setIsCreating(false)
        const msg = `Product code ${input.product_code} is already in use`
        setError(msg)
        return { ok: false, error: msg }
      }

      const payload: Record<string, unknown> = {
        name: input.name.trim(),
        product_code: input.product_code.trim(),
        type: 'dish',
        base_unit: 'portion',
        category_id: input.category_id,
        is_available: input.is_available,
        is_featured: input.is_featured,
      }
      if (input.portion_size !== null && input.portion_unit !== null) {
        payload.portion_size = input.portion_size
        payload.portion_unit = input.portion_unit
      }
      if (input.price !== null && input.price > 0) {
        payload.price = input.price
      }

      const { data, error: insertError } = await supabase
        .from('nomenclature')
        .insert(payload)
        .select('id')
        .single()

      setIsCreating(false)

      if (insertError) {
        const msg = insertError.message
        setError(msg)
        return { ok: false, error: msg }
      }

      return { ok: true, id: data.id as string }
    },
    [isCodeTaken],
  )

  return {
    categories,
    subcategories,
    isLoadingCategories,
    isCreating,
    error,
    createDish,
    isCodeTaken,
  }
}
