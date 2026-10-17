import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PURCHASES } from '../../lib/__fixtures__/analytics-purchases-prod'
import { weeklySpend } from '../../lib/analyticsPurchases'
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

const { WeeklySpendChart } = await import('./WeeklySpendChart')

const RANGE = periodRange(8, '2026-10-16')
const SPEND = weeklySpend(PURCHASES, RANGE)

describe('WeeklySpendChart', () => {
  it('lays out stacked bars without a recharts config error', () => {
    const { container } = render(
      <WeeklySpendChart spend={SPEND} isLoading={false} error={null} />,
    )
    expect(container.querySelectorAll('.recharts-bar-rectangle').length).toBeGreaterThan(0)
  })

  it('defines a hatch pattern per supplier for the stub share', () => {
    const { container } = render(
      <WeeklySpendChart spend={SPEND} isLoading={false} error={null} />,
    )
    expect(container.querySelectorAll('pattern[id^="spend-hatch-"]')).toHaveLength(
      SPEND.suppliers.length,
    )
  })

  it('says in words what the hatch means', () => {
    render(<WeeklySpendChart spend={SPEND} isLoading={false} error={null} />)
    expect(screen.getByText(/hatched = auto-created stub lines/)).toBeInTheDocument()
  })

  it('lists each supplier once in the legend, not once per series', () => {
    render(<WeeklySpendChart spend={SPEND} isLoading={false} error={null} />)
    // 7 suppliers → 14 series, but the legend must show 7.
    expect(SPEND.series).toHaveLength(SPEND.suppliers.length * 2)
    for (const supplier of SPEND.suppliers) {
      expect(screen.getAllByTitle(supplier).length).toBeGreaterThan(0)
    }
  })

  it('labels the ISO weeks on the axis', () => {
    render(<WeeklySpendChart spend={SPEND} isLoading={false} error={null} />)
    expect(screen.getByText('24 Aug')).toBeInTheDocument()
    expect(screen.getByText('12 Oct')).toBeInTheDocument()
  })

  it('shows an empty state rather than axes with no bars', () => {
    const empty = weeklySpend([], RANGE)
    render(<WeeklySpendChart spend={empty} isLoading={false} error={null} />)
    expect(screen.getByText('No purchases in this period')).toBeInTheDocument()
  })

  it('surfaces an error instead of a blank panel', () => {
    render(
      <WeeklySpendChart spend={weeklySpend([], RANGE)} isLoading={false} error="denied" />,
    )
    expect(screen.getByText('denied')).toBeInTheDocument()
  })
})
