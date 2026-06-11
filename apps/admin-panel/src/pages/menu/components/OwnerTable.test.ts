import { describe, it, expect } from 'vitest'
import { siteBadgeState, loyversePriceDrift } from './OwnerTable'
import type { MenuItem } from '../../../hooks/useMenuData'

describe('OwnerTable', () => {
  it('exports OwnerTable component', async () => {
    const mod = await import('./OwnerTable')
    expect(mod.OwnerTable).toBeDefined()
    expect(typeof mod.OwnerTable).toBe('function')
  })
})

// siteBadgeState only reads kind / is_web_visible / is_available /
// loyverse_synced_at / updated_at, so a partial cast is enough.
function dish(over: Partial<MenuItem>): MenuItem {
  return {
    kind: 'SALE',
    is_web_visible: false,
    is_available: true,
    loyverse_synced_at: null,
    updated_at: null,
    price: null,
    loyverse_price: null,
    ...over,
  } as MenuItem
}

describe('siteBadgeState (mig 263 website visibility)', () => {
  it('returns "na" for non-SALE items', () => {
    expect(siteBadgeState(dish({ kind: 'PF', is_web_visible: true }))).toBe('na')
    expect(siteBadgeState(dish({ kind: 'MOD', is_web_visible: true }))).toBe('na')
  })

  it('returns "hidden" when is_web_visible is false (decoupled from availability)', () => {
    expect(siteBadgeState(dish({ is_web_visible: false, is_available: true }))).toBe('hidden')
  })

  it('returns "live" when web-visible, available, and not Loyverse-stale', () => {
    expect(siteBadgeState(dish({ is_web_visible: true, is_available: true }))).toBe('live')
  })

  it('returns "warn" when web-visible but not orderable (is_available off)', () => {
    expect(siteBadgeState(dish({ is_web_visible: true, is_available: false }))).toBe('warn')
  })

  it('returns "warn" when web-visible but Loyverse price is stale', () => {
    expect(
      siteBadgeState(
        dish({
          is_web_visible: true,
          is_available: true,
          loyverse_synced_at: '2026-06-01T00:00:00Z',
          updated_at: '2026-06-08T00:00:00Z',
        }),
      ),
    ).toBe('warn')
  })

  it('stays "live" when the DB row predates the last Loyverse sync', () => {
    expect(
      siteBadgeState(
        dish({
          is_web_visible: true,
          is_available: true,
          loyverse_synced_at: '2026-06-08T00:00:00Z',
          updated_at: '2026-06-01T00:00:00Z',
        }),
      ),
    ).toBe('live')
  })
})

describe('loyversePriceDrift (mig 264 POS price mismatch)', () => {
  it('returns the Loyverse price when it differs from DB price', () => {
    expect(loyversePriceDrift(dish({ price: 111, loyverse_price: 89 }))).toBe(89)
  })

  it('returns null when DB and Loyverse prices match', () => {
    expect(loyversePriceDrift(dish({ price: 111, loyverse_price: 111 }))).toBeNull()
  })

  it('returns null when loyverse_price is unknown', () => {
    expect(loyversePriceDrift(dish({ price: 111, loyverse_price: null }))).toBeNull()
  })

  it('returns null for non-SALE items', () => {
    expect(loyversePriceDrift(dish({ kind: 'PF', price: 111, loyverse_price: 89 }))).toBeNull()
  })
})
