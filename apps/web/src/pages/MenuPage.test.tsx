import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import MenuPage from './MenuPage.tsx'
import type { MenuDish } from '../hooks/usePublicMenu.ts'

const dish = (over: Partial<MenuDish>): MenuDish => ({
  id: 'x',
  name: 'Dish',
  description: null,
  price: 79,
  portion_size: null,
  portion_unit: null,
  image_url: null,
  is_featured: false,
  calories: null,
  protein: null,
  carbs: null,
  fat: null,
  category_id: 'c',
  category_code: 'man',
  category_name: 'Manaish',
  tags: [],
  allergens: [],
  ...over,
})

const categories = [
  {
    code: 'man',
    name: 'Manaish',
    dishes: [
      dish({ id: '1', name: 'Truffle Lamb', price: 79, image_url: 'http://img/x.jpg' }),
      dish({ id: '2', name: 'Cheese Mushroom', price: 69, image_url: null }),
    ],
  },
]

vi.mock('../hooks/usePublicMenu.ts', () => ({
  usePublicMenu: () => ({ categories, isLoading: false, error: null }),
}))

const renderPage = () =>
  render(
    <MemoryRouter>
      <MenuPage />
    </MemoryRouter>,
  )

describe('<MenuPage />', () => {
  it('renders live prices from the data layer', () => {
    renderPage()
    expect(screen.getByText('Truffle Lamb')).toBeInTheDocument()
    expect(screen.getByText('฿79')).toBeInTheDocument()
    expect(screen.getByText('฿69')).toBeInTheDocument()
  })

  it('shows a branded placeholder for a dish without a photo', () => {
    renderPage()
    expect(screen.getByText('No photo')).toBeInTheDocument()
  })

  it('opens the dish modal when a card is clicked', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByText('Truffle Lamb'))
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })
})
