import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Consumer-label data for a SALE dish: nutrition (КБЖУ) + composition (состав).
 *
 * Nutrition is stored per base_unit on `nomenclature` — for SALE dishes the
 * base_unit is a piece / portion, so the stored values are already per portion.
 * `customer_ingredients` is the manually-maintained ingredient text shown on
 * the public site. No cost/price columns — safe for the cook tier.
 */
export interface SaleLabelInfo {
  calories: number | null
  protein: number | null
  fat: number | null
  carbs: number | null
  /** Ingredient text (состав), HTML entities decoded; null when not set. */
  ingredients: string | null
  /** One-portion physical size, e.g. 200 — used as the default qty + label weight. */
  portionSize: number | null
  /** Unit for portionSize, e.g. "g" / "ml". */
  portionUnit: string | null
}

/** Shape of the row we read (untyped supabase client). */
interface NutritionRow {
  calories: number | null
  protein: number | null
  fat: number | null
  carbs: number | null
  customer_ingredients: string | null
  portion_size: number | null
  portion_unit: string | null
}

/** Decode the few HTML entities that leak into customer_ingredients text. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

/**
 * Fetch nutrition + composition for one dish, only when `enabled` (i.e. the
 * item is a SALE dish). PF preps don't get a consumer label, so the query is
 * skipped for them.
 */
export function useSaleLabelInfo(nomenclatureId: string | null, enabled: boolean) {
  const [info, setInfo] = useState<SaleLabelInfo | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!enabled || !nomenclatureId) {
      setInfo(null)
      return
    }
    let cancelled = false
    setIsLoading(true)

    supabase
      .from('nomenclature')
      .select('calories, protein, fat, carbs, customer_ingredients, portion_size, portion_unit')
      .eq('id', nomenclatureId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        const row = data as NutritionRow | null
        if (!row) {
          setInfo(null)
        } else {
          const raw = (row.customer_ingredients ?? '').trim()
          setInfo({
            calories: row.calories,
            protein: row.protein,
            fat: row.fat,
            carbs: row.carbs,
            ingredients: raw ? decodeEntities(raw) : null,
            portionSize: row.portion_size,
            portionUnit: row.portion_unit,
          })
        }
        setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [nomenclatureId, enabled])

  return { info, isLoading }
}
