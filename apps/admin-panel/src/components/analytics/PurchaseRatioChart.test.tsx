import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FOOD_COST } from '../../lib/__fixtures__/analytics-purchases-prod'
import { ratioSeries } from '../../lib/analyticsPurchases'
import { periodRange } from '../../lib/analytics'

/* recharts measures 0x0 under jsdom, so charts render nothing and a broken
 * axis or series config passes silently. A fixed size makes it lay out for
 * real. Inlined per file because vi.mock factories hoist above imports. */
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>()
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <actual.ResponsiveContainer width={800} height={400}>
        {children as React.ReactElement}
      </actual.ResponsiveContainer>
    ),
  }
})

const { PurchaseRatioChart } = await import('./PurchaseRatioChart')

const RANGE = periodRange(8, '2026-10-16')
const DATA = ratioSeries(FOOD_COST, RANGE)

describe('PurchaseRatioChart', () => {
  it('draws two lines and the target band', () => {
    const { container } = render(
      <PurchaseRatioChart data={DATA} range={RANGE} isLoading={false} error={null} />,
    )
    expect(container.querySelectorAll('.recharts-line')).toHaveLength(2)
    expect(container.querySelector('.recharts-reference-area')).toBeTruthy()
  })

  it('reports the latest rolling mean and whether it clears the band', () => {
    render(<PurchaseRatioChart data={DATA} range={RANGE} isLoading={false} error={null} />)
    // Prod: the 4-week mean to 2026-10-12 is well above 35 %.
    // "4-week mean" is in both the subhead and the explanatory note.
    expect(screen.getAllByText(/4-week mean/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/outside the band/)).toBeInTheDocument()
  })

  it('explains why the weekly line cannot be read against the band', () => {
    render(<PurchaseRatioChart data={DATA} range={RANGE} isLoading={false} error={null} />)
    expect(screen.getByText(/Purchasing is lumpy/)).toBeInTheDocument()
  })

  it("warns that the view's own food-cost figure reads too low", () => {
    render(<PurchaseRatioChart data={DATA} range={RANGE} isLoading={false} error={null} />)
    expect(screen.getByText(/counts only canonical items/)).toBeInTheDocument()
  })

  it('shows an empty state when there is no revenue', () => {
    render(<PurchaseRatioChart data={ratioSeries([], RANGE)} range={RANGE} isLoading={false} error={null} />)
    expect(screen.getByText('No revenue in this period')).toBeInTheDocument()
  })
})
