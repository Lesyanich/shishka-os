import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

export type AvailableFilter = 'yes' | 'no' | null
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
  is_available: boolean
  loyverse_id: string | null
  image_url: string | null
  calories: number | string | null
  price: number | null
  hasBom: boolean
}

const KNOWN_FLAGS: readonly FlagKey[] = ['no-photo', 'no-kbju', 'no-bom', 'draft']

export function parseFiltersFromParams(params: URLSearchParams): MenuFilters {
  const catRaw = params.get('cat')
  const categoryIds = catRaw ? catRaw.split(',').filter(Boolean) : []

  const availableRaw = params.get('available')
  const available: AvailableFilter =
    availableRaw === 'yes' || availableRaw === 'no' ? availableRaw : null

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
    available: f.available,
    loyverse: f.loyverse,
    flags: f.flags.length ? f.flags.join(',') : null,
  }
}

export function applyFilters<T extends FilteredItem>(items: T[], f: MenuFilters): T[] {
  return items.filter((item) => {
    if (f.categoryIds.length > 0) {
      if (!item.category_id || !f.categoryIds.includes(item.category_id)) return false
    }
    if (f.available === 'yes' && !item.is_available) return false
    if (f.available === 'no' && item.is_available) return false
    if (f.loyverse === 'synced' && !item.loyverse_id) return false
    if (f.loyverse === 'unsynced' && item.loyverse_id) return false
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
      (filters.available ? 1 : 0) +
      (filters.loyverse ? 1 : 0) +
      filters.flags.length,
    [filters],
  )

  const clearAll = useCallback(() => {
    setFilters({ categoryIds: [], available: null, loyverse: null, flags: [] })
  }, [setFilters])

  return { filters, setFilters, activeCount, clearAll }
}
