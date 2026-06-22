import { lazy, type ComponentType } from 'react'

/**
 * sessionStorage guard key. Set right before a recovery reload so we reload
 * AT MOST ONCE per tab session. A genuinely broken deploy (chunk still 404s
 * after the reload) therefore surfaces the real error instead of looping.
 */
export const RELOAD_KEY = 'shishka:chunk-reload'

/**
 * True when `err` looks like a dynamic-import / chunk-load failure. After a
 * Vercel redeploy the old content-hashed chunk URLs are gone; the SPA fallback
 * serves index.html (text/html) with HTTP 200, so the dynamic `import()`
 * rejects with one of these messages instead of a clean 404.
 *
 * Exported so App.tsx can reuse it in the Sentry ErrorBoundary fallback.
 */
export function isChunkLoadError(err: unknown): boolean {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : ''
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(
    message,
  )
}

/**
 * Drop-in replacement for `React.lazy` that auto-recovers from stale-chunk
 * loads after a deploy. On a chunk-load error it performs a single
 * sessionStorage-guarded `window.location.reload()` (fetching the fresh
 * index.html + chunk manifest) and returns a never-resolving promise so the
 * Suspense fallback stays visible until the reload takes over. On success it
 * clears the guard. Any non-chunk error (or a chunk error after the guard is
 * already set) is rethrown so the ErrorBoundary handles it normally.
 */
export function lazyWithReload<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
): React.LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const m = await factory()
      sessionStorage.removeItem(RELOAD_KEY)
      return m
    } catch (err) {
      if (isChunkLoadError(err) && !sessionStorage.getItem(RELOAD_KEY)) {
        sessionStorage.setItem(RELOAD_KEY, String(performance.now()))
        window.location.reload()
        // Never resolve: keep the Suspense fallback on screen while the
        // browser reloads. Resolving/rejecting here would flash content or
        // surface the error before the reload completes.
        return new Promise<never>(() => {})
      }
      throw err
    }
  })
}
