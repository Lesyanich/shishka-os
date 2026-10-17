import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { INVENTORY } from '../../lib/__fixtures__/analytics-stock-prod'
import { inventoryValueSummary } from '../../lib/analyticsStock'
import { InventoryValueTile } from './InventoryValueTile'

const SUMMARY = inventoryValueSummary(INVENTORY)

describe('InventoryValueTile', () => {
  it('shows the SQL-verified total', () => {
    render(<InventoryValueTile summary={SUMMARY} isLoading={false} />)
    expect(screen.getByText('฿19,015')).toBeInTheDocument()
    expect(screen.getByText(/over 122 counted lines/)).toBeInTheDocument()
  })

  it('breaks it down by location, biggest first', () => {
    render(<InventoryValueTile summary={SUMMARY} isLoading={false} />)
    expect(screen.getByText('Fridge')).toBeInTheDocument()
    expect(screen.getByText('฿10,946')).toBeInTheDocument()
    expect(screen.getByText('Bar')).toBeInTheDocument()
    expect(screen.getByText('฿6,418')).toBeInTheDocument()
  })

  it('leads with the age of the count', () => {
    render(<InventoryValueTile summary={SUMMARY} isLoading={false} />)
    expect(screen.getByText(/At the count of 2026-09-01 · 46 days ago/)).toBeInTheDocument()
  })

  it('says the total is a floor because some stock has no cost', () => {
    render(<InventoryValueTile summary={SUMMARY} isLoading={false} />)
    expect(screen.getByText('14 of 122')).toBeInTheDocument()
    expect(screen.getByText(/this total is a floor, not the holding/)).toBeInTheDocument()
  })

  it('does not confuse an empty shelf with a missing cost', () => {
    render(<InventoryValueTile summary={SUMMARY} isLoading={false} />)
    expect(screen.getByText(/genuinely\s+empty — that zero is correct/)).toBeInTheDocument()
  })

  it('discloses the value sitting on stub items', () => {
    render(<InventoryValueTile summary={SUMMARY} isLoading={false} />)
    expect(screen.getByText(/auto-created\s+stub item/)).toBeInTheDocument()
  })

  it('marks the location whose whole value is uncosted', () => {
    render(<InventoryValueTile summary={SUMMARY} isLoading={false} />)
    // Chocolate Counter: 5 lines, every one without a cost.
    expect(screen.getByTitle('5 of 5 lines here have no cost on file')).toBeInTheDocument()
  })

  it('says so when nothing was ever counted', () => {
    render(<InventoryValueTile summary={inventoryValueSummary([])} isLoading={false} />)
    expect(screen.getByText('No stock count on record')).toBeInTheDocument()
  })
})
