import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AnalyticsLayout } from './AnalyticsLayout'

function renderShell(at = '/analytics/sales') {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route path="/analytics" element={<AnalyticsLayout />}>
          <Route path="sales" element={<div>sales tab</div>} />
          <Route path="purchases" element={<div>purchases tab</div>} />
          <Route path="stock" element={<div>stock tab</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('AnalyticsLayout', () => {
  it('registers all three tabs from the start', () => {
    renderShell()
    expect(screen.getByRole('link', { name: /Sales pulse/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Purchases/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Stock control/ })).toBeInTheDocument()
  })

  it('marks the open tab as current, which is what styles it', () => {
    renderShell('/analytics/purchases')
    expect(screen.getByRole('link', { name: /Purchases/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: /Sales pulse/ })).not.toHaveAttribute('aria-current')
  })

  it('renders the active tab through the outlet', () => {
    renderShell('/analytics/stock')
    expect(screen.getByText('stock tab')).toBeInTheDocument()
  })

  it('offers 4 / 8 / 13 weeks, opening on 8', () => {
    renderShell()
    expect(screen.getByTitle('Last 4 ISO weeks')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTitle('Last 8 ISO weeks')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTitle('Last 13 ISO weeks')).toHaveAttribute('aria-pressed', 'false')
  })

  it('moves the selection when a period is picked', async () => {
    renderShell()
    await userEvent.click(screen.getByTitle('Last 13 ISO weeks'))
    expect(screen.getByTitle('Last 13 ISO weeks')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTitle('Last 8 ISO weeks')).toHaveAttribute('aria-pressed', 'false')
  })

  it('keeps the period selector available on every tab', async () => {
    renderShell('/analytics/purchases')
    await userEvent.click(screen.getByTitle('Last 4 ISO weeks'))
    expect(screen.getByTitle('Last 4 ISO weeks')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('purchases tab')).toBeInTheDocument()
  })
})
