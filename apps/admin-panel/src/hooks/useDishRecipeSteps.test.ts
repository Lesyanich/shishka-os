import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
  },
}))

describe('useDishRecipeSteps', () => {
  it('exports useDishRecipeSteps hook', async () => {
    const mod = await import('./useDishRecipeSteps')
    expect(mod.useDishRecipeSteps).toBeDefined()
    expect(typeof mod.useDishRecipeSteps).toBe('function')
  })

  it('exports RECIPE_STEP_SELECT including nomenclature_id and the location join', async () => {
    const { RECIPE_STEP_SELECT } = await import('./useDishRecipeSteps')
    expect(RECIPE_STEP_SELECT).toContain('nomenclature_id')
    expect(RECIPE_STEP_SELECT).toContain('location:locations(name, type)')
  })

  it('mapRecipeStep maps a raw recipes_flow row to a DishRecipeStep', async () => {
    const { mapRecipeStep } = await import('./useDishRecipeSteps')
    const step = mapRecipeStep({
      id: 'step-1',
      step_order: 3,
      operation_name: '[L2] Sear',
      duration_min: 4,
      instruction_text: 'Sear to opaque.',
      temperature_c: null,
      internal_temp_c: 74,
      equipment: { name: 'Lava Grill', category: 'cooking' },
      notes: null,
      is_ccp: false,
      ccp_check_text: null,
      is_passive: false,
      location_id: 'loc-assembly',
      location: { name: 'Assembly', type: 'assembly' },
    })
    expect(step.step_number).toBe(3)
    expect(step.equipment_name).toBe('Lava Grill')
    expect(step.equipment_category).toBe('cooking')
    expect(step.location_name).toBe('Assembly')
    expect(step.location_type).toBe('assembly')
    expect(step.internal_temp_c).toBe(74)
  })
})
