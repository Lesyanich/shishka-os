import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import BundleBuilder from './BundleBuilder.tsx'
import type { MenuDish } from '../hooks/usePublicMenu.ts'

afterEach(cleanup)

const dish = (id: string, name: string, price: number, cat: string): MenuDish => ({
  id,
  product_code: `SALE-${id.toUpperCase()}`,
  name,
  description: null,
  price,
  from_price: null,
  portion_size: null,
  portion_unit: null,
  image_url: null,
  is_featured: false,
  calories: null,
  protein: null,
  carbs: null,
  fat: null,
  category_id: null,
  category_code: cat,
  category_name: null,
  tags: [],
  allergens: [],
})

const bundleDish = dish('bundle4', 'Manakish Bundle ×4', 0, 'KP-FIN-BND')
const zaatar = dish('zaatar', 'Zaatar', 59, 'KP-FIN-MAN')
const beef = dish('beef', 'Beef', 69, 'KP-FIN-MAN')
const hummus = dish('hummus', 'Hummus Sauce', 39, 'KP-FIN-SDR')

function setup(onConfirm = vi.fn()) {
  render(
    <BundleBuilder
      bundleDish={bundleDish}
      manakishCount={4}
      sauceCount={1}
      manakishPool={[zaatar, beef]}
      saucePool={[hummus]}
      onClose={vi.fn()}
      onConfirm={onConfirm}
    />,
  )
  return { onConfirm }
}

describe('BundleBuilder', () => {
  it('keeps confirm disabled until the exact counts are picked', () => {
    setup()
    expect(screen.getByRole('button', { name: /pick .* more manakish/i })).toBeDisabled()
  })

  it('allows repeats of the same flavour and enables confirm when complete', () => {
    setup()
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByLabelText('Add one Zaatar'))
    fireEvent.click(screen.getByLabelText('Add one Hummus Sauce'))

    const confirm = screen.getByRole('button', { name: /add bundle/i })
    expect(confirm).toBeEnabled()
    // each ฿59 → ฿50; 4 × 50 = ฿200
    expect(confirm).toHaveTextContent('฿200')
  })

  it('confirms with the chosen children (repeats collapse to one line with qty) and price', () => {
    const { onConfirm } = setup()
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByLabelText('Add one Zaatar'))
    fireEvent.click(screen.getByLabelText('Add one Hummus Sauce'))
    fireEvent.click(screen.getByRole('button', { name: /add bundle/i }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    const [children, price] = onConfirm.mock.calls[0]
    expect(price).toBe(200)
    expect(children).toEqual([
      { dish: zaatar, quantity: 4, role: 'manakish' },
      { dish: hummus, quantity: 1, role: 'sauce' },
    ])
  })

  it('caps additions at the required count (cannot exceed)', () => {
    setup()
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByLabelText('Add one Zaatar'))
    // Pool is full → the other flavour's add button is disabled.
    expect(screen.getByLabelText('Add one Beef')).toBeDisabled()
  })
})
