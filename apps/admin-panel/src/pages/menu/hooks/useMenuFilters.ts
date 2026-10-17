import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

/** 'all' = no availability filter (retired/archived dishes included).
 * Owner view DEFAULTS to 'yes': the live menu is what the owner wants to see on
 * open, not the ~100 retired SALE rows we keep for history. `?available=all`
 * brings them back. Same convention as the L2 station in StationRecipesView. */
export type AvailableFilter = 'yes' | 'no' | 'all'
export const DEFAULT_AVAILABLE: AvailableFilter = 'yes'
export type LoyverseFilter = 'synced' | 'unsynced' | null
export type FlagKey = 'no-photo' | 'no-kbju' | 'no-bom' | 'draft'

export interface MenuFilters {
  categoryIds: string[]
  available: AvailableFilter
  loyverse: LoyverseFilter
  flags: FlagKey[]
}

export interface FilteredItem {
  id: string
  category_id: string | null
  /** Section the dish rolls up to (umbrella). Category chips select sections,
   * so filtering matches on this; falls back to category_id when absent. */
  section_id?: string | null
  is_available: boolean
  loyverse_item_id: string | null
  image_url: string | null
  calories: number | string | null
  price: number | null
  hasBom: boolean
}

const KNOWN_FLAGS: readonly FlagKey[] = ['no-photo', 'no-kbju', 'no-bom', 'draft']

export function parseFiltersFromParams(params: URLSearchParams): MenuFilters {
  const catRaw = params.get('cat')
  const categoryIds = catRaw ? catRaw.split(',').filter(Boolean) : []

  // Absent or unknown → DEFAULT_AVAILABLE ('yes'), so a bare /menu hides retired dishes.
  const availableRaw = params.get('available')
  const available: AvailableFilter =
    availableRaw === 'no' || availableRaw === 'all' || availableRaw === 'yes'
      ? availableRaw
      : DEFAULT_AVAILABLE

  const loyverseRaw = params.get('loyverse')
  const loyverse: LoyverseFilter =
    loyverseRaw === 'synced' || loyverseRaw === 'unsynced' ? loyverseRaw : null

  const flagsRaw = params.get('flags')
  const flags: FlagKey[] = flagsRaw
    ? (flagsRaw.split(',').filter((f) => (KNOWN_FLAGS as readonly string[]).includes(f)) as FlagKey[])
    : []

  return { categoryIds, available, loyverse, flags }
}

export function serializeFilters(f: MenuFilters): Record<string, string | null> {
  return {
    cat: f.categoryIds.length ? f.categoryIds.join(',') : null,
    // The default needs no param — keeps the URL clean and re-parses to 'yes'.
    available: f.available === DEFAULT_AVAILABLE ? null : f.available,
    loyverse: f.loyverse,
    flags: f.flags.length ? f.flags.join(',') : null,
  }
}

/** True when the filter set differs from what a bare /menu shows. */
export function isNonDefault(f: MenuFilters): boolean {
  return (
    f.categoryIds.length > 0 ||
    f.available !== DEFAULT_AVAILABLE ||
    f.loyverse !== null ||
    f.flags.length > 0
  )
}

export function defaultFilters(): MenuFilters {
  return { categoryIds: [], available: DEFAULT_AVAILABLE, loyverse: null, flags: [] }
}

export function applyFilters<T extends FilteredItem>(items: T[], f: MenuFilters): T[] {
  return items.filter((item) => {
    if (f.categoryIds.length > 0) {
      const sec = item.section_id ?? item.category_id
      if (!sec || !f.categoryIds.includes(sec)) return false
    }
    if (f.available === 'yes' && !item.is_available) return false
    if (f.available === 'no' && item.is_available) return false
    if (f.loyverse === 'synced' && !item.loyverse_item_id) return false
    if (f.loyverse === 'unsynced' && item.loyverse_item_id) return false
    if (f.flags.length > 0) {
      const matches = f.flags.some((flag) => {
        if (flag === 'no-photo') return !item.image_url
        if (flag === 'no-kbju') return item.calories == null
        if (flag === 'no-bom') return !item.hasBom
        // Draft = no price set. `!price` also matches price === 0, which we
        // treat as draft by design (no legitimate ฿0 sale dish at Shishka).
        if (flag === 'draft') return !item.price
        return false
      })
      if (!matches) return false
    }
    return true
  })
}

export function useMenuFilters() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = useMemo(() => parseFiltersFromParams(searchParams), [searchParams])

  const setFilters = useCallback(
    (next: MenuFilters) => {
      const patch = serializeFilters(next)
      setSearchParams(
        (prev) => {
          const out = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(patch)) {
            if (v == null || v === '') out.delete(k)
            else out.set(k, v)
          }
          return out
        },
        { replace: false },
      )
    },
    [setSearchParams],
  )

  const activeCount = useMemo(
    () =>
      filters.categoryIds.length +
      (filters.available !== DEFAULT_AVAILABLE ? 1 : 0) +
      (filters.loyverse ? 1 : 0) +
      filters.flags.length,
    [filters],
  )

  // "Clear" returns to the defaults (available dishes only), not to an unfiltered
  // list — seeing retired dishes is an explicit choice via the Available chip.
  const clearAll = useCallback(() => {
    setFilters(defaultFilters())
  }, [setFilters])

  return { filters, setFilters, activeCount, clearAll }
}
