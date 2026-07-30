import { describe, it, expect, vi } from 'vitest'
import { buildNomenclaturePatch } from './useDishCardSave'

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: () =>
      Promise.resolve({ data: { ok: true, new_version: 2 }, error: null }),
  },
}))

describe('useDishCardSave', () => {
  it('exports useDishCardSave hook', async () => {
    const mod = await import('./useDishCardSave')
    expect(mod.useDishCardSave).toBeDefined()
    expect(typeof mod.useDishCardSave).toBe('function')
  })
})

describe('buildNomenclaturePatch', () => {
  it('returns null when neither field was supplied — no pointless UPDATE', () => {
    expect(buildNomenclaturePatch({})).toBeNull()
  })

  it('carries a shelf life through — fn_dish_card_save does not touch it', () => {
    expect(buildNomenclaturePatch({ shelf_life_days: 3 })).toEqual({ shelf_life_days: 3 })
  })

  it('distinguishes "clear it" from "not supplied"', () => {
    // null must be written (the owner emptied the field); undefined must not.
    expect(buildNomenclaturePatch({ shelf_life_days: null })).toEqual({ shelf_life_days: null })
    expect(buildNomenclaturePatch({ shelf_life_days: undefined })).toBeNull()
    expect(buildNomenclaturePatch({ image_url: null })).toEqual({ image_url: null })
  })

  it('sends both fields in one update when both changed', () => {
    expect(buildNomenclaturePatch({ image_url: 'https://x/y.webp', shelf_life_days: 5 })).toEqual({
      image_url: 'https://x/y.webp',
      shelf_life_days: 5,
    })
  })
})
