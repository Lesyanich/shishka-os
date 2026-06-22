import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
  },
}))

describe('usePfPackCard', () => {
  it('exports usePfPackCard hook', async () => {
    const mod = await import('./usePfPackCard')
    expect(mod.usePfPackCard).toBeDefined()
    expect(typeof mod.usePfPackCard).toBe('function')
  })

  // mig 307: shelf_life_days is no longer a pf_pack_card field — it lives on
  // nomenclature (single source of truth, also drives batch expiry). A returned
  // card row must therefore never carry shelf_life_days.
  it('card data shape excludes shelf_life_days (moved to nomenclature)', async () => {
    const sample = {
      nomenclature_id: 'pf-1',
      batch_input_qty: null,
      batch_input_uom: null,
      portions_per_batch: null,
      portion_weight_g: null,
      vacuum_bag_size: null,
      fill_weight_per_bag_g: null,
      portions_per_bag: null,
      label_template: null,
      storage_zone: null,
      storage_temp_min_c: null,
      storage_temp_max_c: null,
      kitchen_photo_url: null,
    }
    // Compile-time guarantee: PfPackCardData has no shelf_life_days key.
    const mod = await import('./usePfPackCard')
    const card: import('./usePfPackCard').PfPackCardData = sample
    expect(Object.prototype.hasOwnProperty.call(card, 'shelf_life_days')).toBe(false)
    expect(mod.usePfPackCard).toBeDefined()
  })
})
