import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PURCHASES } from '../../lib/__fixtures__/analytics-purchases-prod'
import { supplierTable } from '../../lib/analyticsPurchases'
import { periodRange } from '../../lib/analytics'
import { SupplierTable } from './SupplierTable'

const ROWS = supplierTable(PURCHASES, periodRange(8, '2026-10-16'))

describe('SupplierTable', () => {
  it('is a real table a screen reader can follow', () => {
    const { container } = render(<SupplierTable rows={ROWS} isLoading={false} />)
    expect(container.querySelector('table')).toBeTruthy()
    expect(container.querySelectorAll('thead th')).toHaveLength(6)
    expect(container.querySelectorAll('tbody tr')).toHaveLength(ROWS.length)
  })

  it('leads with the biggest supplier and its SQL-verified spend', () => {
    render(<SupplierTable rows={ROWS} isLoading={false} />)
    expect(screen.getByText('Makro')).toBeInTheDocument()
    expect(screen.getByText('17,298')).toBeInTheDocument()
    // Makro's last delivery; the date is shared with another supplier row.
    const makroRow = screen.getByText('Makro').closest('tr') as HTMLElement
    expect(makroRow.textContent).toContain('2026-10-08')
  })

  it('shows the change against the previous window', () => {
    render(<SupplierTable rows={ROWS} isLoading={false} />)
    // Makro: +76 % vs 9,808.19 the previous eight whole weeks.
    expect(screen.getByText('+76%')).toBeInTheDocument()
  })

  it('marks a supplier with no history as new rather than inventing a delta', () => {
    render(<SupplierTable rows={ROWS} isLoading={false} />)
    expect(screen.getAllByText('new').length).toBeGreaterThan(0)
  })

  it('shows the duplicate supplier names prod actually has, unmerged', () => {
    render(<SupplierTable rows={ROWS} isLoading={false} />)
    // Honest reflection of the data: de-duplicating suppliers is not a UI job.
    expect(screen.getByText('Supercheap Co., Ltd.')).toBeInTheDocument()
    expect(screen.getByText('Supercheap Co., Ltd. Branch 0078')).toBeInTheDocument()
  })

  it('says so when nothing was bought', () => {
    render(<SupplierTable rows={[]} isLoading={false} />)
    expect(screen.getByText('No purchases in this period')).toBeInTheDocument()
  })

  it('renders a skeleton while loading', () => {
    const { container } = render(<SupplierTable rows={[]} isLoading />)
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })
})
