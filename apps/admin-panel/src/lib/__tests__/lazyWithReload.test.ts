import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Suspense, createElement, type ComponentType } from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { isChunkLoadError, lazyWithReload, RELOAD_KEY } from '../lazyWithReload'

// A trivial component the success-path factory can resolve to.
const Dummy: ComponentType<unknown> = () => null

/**
 * Renders a lazyWithReload component inside Suspense, which forces React to
 * invoke the wrapped factory, then waits a microtask tick so the factory's
 * promise settles. Returns the captured render error (if React surfaced one)
 * so tests can assert rethrow behavior.
 */
async function renderLazy(
  factory: () => Promise<{ default: ComponentType<unknown> }>,
): Promise<unknown> {
  const LazyCmp = lazyWithReload(factory)
  const container = document.createElement('div')
  const root = createRoot(container)
  let caught: unknown

  // Swallow React's console.error noise for the intentional throw path.
  const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    await act(async () => {
      root.render(
        createElement(
          Suspense,
          { fallback: createElement('span', null, 'loading') },
          createElement(LazyCmp),
        ),
      )
    })
    // Let the factory promise + React's retry settle.
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
  } catch (err) {
    caught = err
  } finally {
    errSpy.mockRestore()
    act(() => root.unmount())
  }
  return caught
}

describe('isChunkLoadError', () => {
  it('matches known chunk-load failure messages', () => {
    expect(
      isChunkLoadError(
        new Error('Failed to fetch dynamically imported module: /assets/X.js'),
      ),
    ).toBe(true)
    expect(
      isChunkLoadError(new Error('error loading dynamically imported module')),
    ).toBe(true)
    expect(
      isChunkLoadError(new Error('Importing a module script failed.')),
    ).toBe(true)
    expect(isChunkLoadError(new Error('ChunkLoadError: Loading chunk 3 failed')))
      .toBe(true)
    // Plain string messages are matched too.
    expect(isChunkLoadError('Failed to fetch dynamically imported module')).toBe(
      true,
    )
  })

  it('does NOT match unrelated errors', () => {
    expect(isChunkLoadError(new Error('Cannot read properties of undefined')))
      .toBe(false)
    expect(isChunkLoadError(new TypeError('x is not a function'))).toBe(false)
    expect(isChunkLoadError(undefined)).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
    expect(isChunkLoadError({ message: 'whatever' })).toBe(false)
  })
})

describe('lazyWithReload', () => {
  let reloadSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    sessionStorage.clear()
    reloadSpy = vi.fn()
    // window.location.reload is not configurable in jsdom by default; redefine it.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload: reloadSpy },
    })
  })

  afterEach(() => {
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('chunk error + guard unset → reloads exactly once and never rejects', async () => {
    const factory = vi
      .fn()
      .mockRejectedValue(
        new Error('Failed to fetch dynamically imported module: /assets/A.js'),
      )

    const caught = await renderLazy(factory)

    expect(reloadSpy).toHaveBeenCalledTimes(1)
    // Guard was set so a subsequent attempt won't loop.
    expect(sessionStorage.getItem(RELOAD_KEY)).not.toBeNull()
    // Recovery path returns a never-resolving promise → no error surfaced.
    expect(caught).toBeUndefined()
  })

  it('chunk error + guard already set → does NOT reload and rethrows', async () => {
    sessionStorage.setItem(RELOAD_KEY, '123')
    const error = new Error('Failed to fetch dynamically imported module')
    const factory = vi.fn().mockRejectedValue(error)

    const caught = await renderLazy(factory)

    expect(reloadSpy).not.toHaveBeenCalled()
    expect(caught).toBe(error)
  })

  it('non-chunk error → does NOT reload and rethrows', async () => {
    const error = new Error('Cannot read properties of undefined')
    const factory = vi.fn().mockRejectedValue(error)

    const caught = await renderLazy(factory)

    expect(reloadSpy).not.toHaveBeenCalled()
    expect(caught).toBe(error)
  })

  it('successful import → clears the guard key', async () => {
    sessionStorage.setItem(RELOAD_KEY, 'stale-value')
    const factory = vi.fn().mockResolvedValue({ default: Dummy })

    const caught = await renderLazy(factory)

    expect(reloadSpy).not.toHaveBeenCalled()
    expect(sessionStorage.getItem(RELOAD_KEY)).toBeNull()
    expect(caught).toBeUndefined()
  })
})
