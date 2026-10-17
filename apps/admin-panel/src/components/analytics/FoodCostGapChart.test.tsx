import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { periodRange } from '../../lib/analytics'
import { foodCostGapSeries } from '../../lib/analyticsStock'
import { FOOD_COST } from '../../lib/__fixtures__/analytics-purchases-prod'

/* recharts measures 0x0 under jsdom, so a broken axis or series config passes
 * silently. A fixed size makes it lay out for real. Inlined because vi.mock
 * factories hoist above imports. */
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

const { FoodCostGapChart } = await import('./FoodCostGapChart')

const RANGE = periodRange(8, '2026-10-16')
const DATA = foodCostGapSeries(FOOD_COST, RANGE)

describe('FoodCostGapChart', () => {
  it('draws three lines and the shaded gap', () => {
    const { container } = render(
      <FoodCostGapChart data={DATA} range={RANGE} isLoading={false} error={null} />,
    )
    // Theoretical, actual, and the faint canonical-only figure.
    expect(container.querySelectorAll('.recharts-line')).toHaveLength(3)
    expect(container.querySelectorAll('.recharts-area').length).toBeGreaterThan(0)
  })

  it('says plainly that the gap is not shrinkage yet', () => {
    render(<FoodCostGapChart data={DATA} range={RANGE} isLoading={false} error={null} />)
    expect(screen.getByText(/spend\s+not yet linked to an item/)).toBeInTheDocument()
  })

  it('explains why the dashed attributed-only line sits lower', () => {
    render(<FoodCostGapChart data={DATA} range={RANGE} isLoading={false} error={null} />)
    expect(screen.getByText(/the attributed-only\s+figure the view computes/)).toBeInTheDocument()
  })

  it('says the actual is purchases-based with no counts bracketing it', () => {
    render(<FoodCostGapChart data={DATA} range={RANGE} isLoading={false} error={null} />)
    expect(screen.getByText(/purchases-based throughout/)).toBeInTheDocument()
  })

  it('shows an empty state when there is no revenue', () => {
    render(
      <FoodCostGapChart
        data={foodCostGapSeries([], RANGE)}
        range={RANGE}
        isLoading={false}
        error={null}
      />,
    )
    expect(screen.getByText('No revenue in this period')).toBeInTheDocument()
  })

  it('surfaces an error instead of a blank panel', () => {
    render(<FoodCostGapChart data={[]} range={RANGE} isLoading={false} error="denied" />)
    expect(screen.getByText('denied')).toBeInTheDocument()
  })
})
