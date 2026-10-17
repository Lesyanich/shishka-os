import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PRICE_WATCH } from '../../lib/__fixtures__/analytics-purchases-prod'
import { priceWatchView } from '../../lib/analyticsPurchases'
import { PriceWatchTable } from './PriceWatchTable'

const VIEW = priceWatchView(PRICE_WATCH)

describe('PriceWatchTable', () => {
  it('lists the comparable spike prod has', () => {
    render(<PriceWatchTable view={VIEW} isLoading={false} />)
    expect(screen.getByText('Short Cucumber 500 g')).toBeInTheDocument()
    expect(screen.getByText('+44.4%')).toBeInTheDocument()
  })

  it('separates the spike whose pack size is unknown, and says why', () => {
    render(<PriceWatchTable view={VIEW} isLoading={false} />)
    expect(screen.getByText('Iceberg Lettuce')).toBeInTheDocument()
    expect(screen.getByText(/Pack size unresolved/)).toBeInTheDocument()
    expect(screen.getByText(/not comparable/)).toBeInTheDocument()
  })

  it('states that it ignores the period selector', () => {
    render(<PriceWatchTable view={VIEW} isLoading={false} />)
    expect(screen.getByText(/not affected by the period above/)).toBeInTheDocument()
  })

  it('reports how many items have a usable price at all', () => {
    render(<PriceWatchTable view={VIEW} isLoading={false} />)
    expect(screen.getByText(/7 of 25 watched items have a resolved pack size/)).toBeInTheDocument()
    expect(screen.getByText(/bought in only one week so far/)).toBeInTheDocument()
  })

  it('says so when there are no spikes, with the coverage behind that', () => {
    render(
      <PriceWatchTable
        view={{ ...VIEW, comparableSpikes: [], unknownPackSpikes: [] }}
        isLoading={false}
      />,
    )
    expect(screen.getByText('No price spikes in the last 8 weeks')).toBeInTheDocument()
    expect(screen.getByText(/7 of 25 items have a comparable unit price/)).toBeInTheDocument()
  })
})
