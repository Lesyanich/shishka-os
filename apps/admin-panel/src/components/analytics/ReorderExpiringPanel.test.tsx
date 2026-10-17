import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { REPLENISHMENT, STOCK_STATUS } from '../../lib/__fixtures__/analytics-stock-prod'
import { expiringRows, reorderRows, type StockStatusRow } from '../../lib/analyticsStock'
import { ReorderExpiringPanel } from './ReorderExpiringPanel'

describe('ReorderExpiringPanel', () => {
  it('lists the one item below par that prod has', () => {
    render(
      <ReorderExpiringPanel
        reorder={reorderRows(REPLENISHMENT)}
        expiring={expiringRows(STOCK_STATUS)}
        isLoading={false}
      />,
    )
    expect(screen.getByText('Chia Seeds')).toBeInTheDocument()
    expect(screen.getByText('out')).toBeInTheDocument()
    expect(screen.getByText('1 kg')).toBeInTheDocument()
  })

  it('says nothing is expiring, because prod flags nothing', () => {
    render(
      <ReorderExpiringPanel
        reorder={reorderRows(REPLENISHMENT)}
        expiring={expiringRows(STOCK_STATUS)}
        isLoading={false}
      />,
    )
    expect(screen.getByText('Nothing flagged as expiring or expired')).toBeInTheDocument()
  })

  it('states that the period selector does not govern it', () => {
    render(<ReorderExpiringPanel reorder={[]} expiring={[]} isLoading={false} />)
    expect(screen.getByText(/not affected by the period above/)).toBeInTheDocument()
  })

  it('says so when nothing is below par', () => {
    render(<ReorderExpiringPanel reorder={[]} expiring={[]} isLoading={false} />)
    expect(screen.getByText('Nothing below par right now')).toBeInTheDocument()
  })

  it('puts expired ahead of merely expiring', () => {
    const rows: StockStatusRow[] = [
      { nomenclature_id: 'a', product_code: 'A', name: 'soon', storage_location: 'Fridge', next_expiry: null, expiring_soon: 1, expired: 0 },
      { nomenclature_id: 'b', product_code: 'B', name: 'gone', storage_location: 'Fridge', next_expiry: null, expiring_soon: 0, expired: 2 },
    ]
    render(<ReorderExpiringPanel reorder={[]} expiring={expiringRows(rows)} isLoading={false} />)
    expect(screen.getByText('2 expired')).toBeInTheDocument()
    expect(screen.getByText('1 soon')).toBeInTheDocument()
  })
})
