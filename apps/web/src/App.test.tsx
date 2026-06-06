import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App.tsx'

vi.mock('./hooks/usePublicMenu.ts', () => ({
  usePublicMenu: () => ({ categories: [], isLoading: false, error: null }),
}))

describe('<App />', () => {
  it('renders the menu header', () => {
    render(<App />)
    expect(screen.getByText('Shishka')).toBeInTheDocument()
    expect(screen.getByText('Healthy Kitchen')).toBeInTheDocument()
  })
})
