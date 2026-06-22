import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * Resolves the active tab from a raw URL param value. Pure (no React) so it can
 * be unit-tested without a router. Returns `fallback` when `raw` is missing or
 * not one of the allowed `tabs`.
 */
export function resolveTab<T extends string>(
  raw: string | null,
  tabs: readonly T[],
  fallback: T,
): T {
  return (tabs as readonly string[]).includes(raw ?? '') ? (raw as T) : fallback
}

/**
 * Drives a page's active tab from a URL query param (default `?tab=...`) instead
 * of component state, so every tab is linkable, refresh-stable, and reachable
 * via the browser back button — not trapped in `useState`.
 *
 *   const [tab, setTab] = useTabParam(['schedule', 'staff'] as const, 'schedule')
 *
 * Drop-in for `useState`: keep the same variable names and the rest of the
 * component (onClick handlers, conditional rendering) is unchanged.
 */
export function useTabParam<T extends string>(
  tabs: readonly T[],
  fallback: T,
  key = 'tab',
): readonly [T, (next: T) => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const active = resolveTab(searchParams.get(key), tabs, fallback)

  const setActive = useCallback(
    (next: T) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev)
          params.set(key, next)
          return params
        },
        { replace: false },
      )
    },
    [setSearchParams, key],
  )

  return [active, setActive] as const
}
