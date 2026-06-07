import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.ts'

/** One dish as exposed by the v_public_menu view (customer-safe, no cost data). */
export interface MenuDish {
  id: string
  product_code: string
  name: string
  description: string | null
  price: number | null
  /** For build-your-own dishes: the true minimum ("From ฿X"). Null otherwise. */
  from_price: number | null
  portion_size: number | null
  portion_unit: string | null
  image_url: string | null
  is_featured: boolean
  calories: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
  category_id: string | null
  category_code: string | null
  category_name: string | null
  tags: { slug: string; name: string; group?: string | null; color?: string | null }[]
  allergens: string[]
}

export interface MenuCategory {
  code: string
  name: string
  dishes: MenuDish[]
}

interface UsePublicMenuResult {
  categories: MenuCategory[]
  isLoading: boolean
  error: string | null
}

/** Reads the anon-safe public menu and groups dishes by category. */
export function usePublicMenu(): UsePublicMenuResult {
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error: err } = await supabase
        .from('v_public_menu')
        .select('*')
        .order('is_featured', { ascending: false })
        .order('name')

      if (cancelled) return
      if (err) {
        setError(err.message)
        setIsLoading(false)
        return
      }

      const rows = (data ?? []) as MenuDish[]
      const byCat = new Map<string, MenuCategory>()
      for (const dish of rows) {
        const code = dish.category_code ?? 'other'
        const name = dish.category_name ?? 'Menu'
        if (!byCat.has(code)) byCat.set(code, { code, name, dishes: [] })
        byCat.get(code)!.dishes.push(dish)
      }
      setCategories([...byCat.values()])
      setIsLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return { categories, isLoading, error }
}
