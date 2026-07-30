import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { DishDrawer } from './DishDrawer'
import type { MenuItem } from '../../../hooks/useMenuData'

/**
 * End-to-end wiring guard for the shelf life of a FINISHED DISH.
 *
 * Until 2026-07-29 there was no editor at all for `SALE-` items — the
 * `/procurement` tab was gone and `/menu`'s storage-label block only renders
 * for `PF-` preps, so 12 dishes carried a `shelf_life_days` nobody could
 * change. The value drives the HACCP label and batch expiry.
 *
 * These tests drive the real drawer: type into the field on the L2 Assembler
 * tab, press Save, and assert what actually reaches the database. Everything
 * between the input and `supabase` is the real code path — only the data
 * fetching hooks and the client itself are stubbed.
 */

const nomenclatureUpdate = vi.fn().mockResolvedValue({ error: null })
const rpc = vi.fn().mockResolvedValue({ data: { ok: true, new_version: 8 }, error: null })

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: (table: string) => ({
      update: (patch: Record<string, unknown>) => ({
        eq: () => nomenclatureUpdate(table, patch),
      }),
    }),
  },
}))

// Data fetching is not what is under test — stub it to a dish that is savable.
// Packaging must be non-empty: the drawer refuses to save a dish without it.
vi.mock('../../../hooks/useDishCard', () => ({
  useDishCard: () => ({
    card: { container_l2: 'Bowl 1300', assembly_order: [], has_cutlery: true },
    components: [],
    packaging: [{ bom_id: 'b1', packaging_id: 'p1', name: 'Bowl 1300 ml', qty: 1 }],
    packagingCatalog: [],
    addPackaging: vi.fn(),
    updatePackagingQty: vi.fn(),
    removePackaging: vi.fn(),
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}))
vi.mock('../../../hooks/useAllergens', () => ({
  useAllergens: () => ({ allergens: [], isLoading: false, error: null, refetch: vi.fn() }),
}))
vi.mock('../../../hooks/useModifierOptions', () => ({
  useModifierOptions: () => ({ modifiers: [], isLoading: false, error: null, refetch: vi.fn() }),
}))
vi.mock('../../../hooks/useDishScorecard', () => ({
  useDishScorecard: () => ({ scorecard: null, isLoading: false, error: null, refetch: vi.fn() }),
}))
vi.mock('../../../hooks/useDishRecipeSteps', () => ({
  useDishRecipeSteps: () => ({ steps: [], isLoading: false, error: null, refetch: vi.fn() }),
}))
vi.mock('../../../hooks/useBomIngredients', () => ({
  useBomIngredients: () => ({ ingredients: [], isLoading: false, error: null }),
}))
vi.mock('../../../hooks/usePfPackCard', () => ({
  usePfPackCard: () => ({ card: null, isLoading: false, error: null, refetch: vi.fn() }),
}))

const dish = {
  id: 'dish-1',
  product_code: 'SALE-BEETROOT_WALNUT',
  name: 'Beetroot Walnut Salad',
  kind: 'SALE',
  card_version: 7,
  shelf_life_days: 3,
  base_unit: 'portion',
  merrychef_program: null,
} as unknown as MenuItem

function openL2Tab() {
  render(<DishDrawer item={dish} onClose={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /L2 Assembler/i }))
}

function shelfLifeInput(): HTMLInputElement {
  // The only spinbutton on the tab whose current value is the dish's shelf life.
  const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[]
  const field = inputs.find((i) => i.max === '365')
  if (!field) throw new Error('shelf-life input not rendered on the L2 Assembler tab')
  return field
}

beforeEach(() => {
  nomenclatureUpdate.mockClear()
  rpc.mockClear()
})
afterEach(cleanup)

describe('shelf life on a finished dish', () => {
  it('shows the value the dish already has', () => {
    openL2Tab()
    expect(shelfLifeInput().value).toBe('3')
  })

  it('writes the new value to nomenclature on Save', async () => {
    openL2Tab()
    fireEvent.change(shelfLifeInput(), { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save/i }))

    await waitFor(() => expect(nomenclatureUpdate).toHaveBeenCalled())
    const [table, patch] = nomenclatureUpdate.mock.calls[0]
    expect(table).toBe('nomenclature')
    expect(patch).toEqual({ shelf_life_days: 4 })
    // The card RPC still runs — the shelf life rides alongside it, it does not
    // replace the normal save.
    expect(rpc).toHaveBeenCalledWith('fn_dish_card_save', expect.anything())
  })

  it('clears the shelf life when the field is emptied', async () => {
    openL2Tab()
    fireEvent.change(shelfLifeInput(), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save/i }))

    await waitFor(() => expect(nomenclatureUpdate).toHaveBeenCalled())
    expect(nomenclatureUpdate.mock.calls[0][1]).toEqual({ shelf_life_days: null })
  })

  it('does not touch nomenclature when the shelf life was not edited', async () => {
    openL2Tab()
    // Dirty the card via a different field, so Save runs for a reason that has
    // nothing to do with the shelf life.
    const textboxes = screen.getAllByRole('textbox') as HTMLInputElement[]
    fireEvent.change(textboxes[0], { target: { value: 'chill before assembly' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save/i }))

    await waitFor(() => expect(rpc).toHaveBeenCalled())
    expect(nomenclatureUpdate).not.toHaveBeenCalled()
  })

  it('refuses to save a value that would print a wrong use-by date', async () => {
    openL2Tab()
    fireEvent.change(shelfLifeInput(), { target: { value: '900' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save/i }))

    await waitFor(() =>
      expect(screen.getByText(/Срок хранения — целое число 1–365 дней/)).toBeTruthy(),
    )
    expect(nomenclatureUpdate).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })
})
