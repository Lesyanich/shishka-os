import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SALES } from '../../lib/__fixtures__/analytics-prod'
import { periodRange, weeklySeries } from '../../lib/analytics'

/* recharts sizes itself from ResponsiveContainer, which measures 0x0 under
 * jsdom — so charts render nothing and a broken axis or series config passes
 * silently. Giving it a fixed size makes recharts do real layout. Inlined per
 * file rather than shared: vi.mock factories are hoisted above imports, so a
 * helper imported here would not be initialised when the factory runs. */
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

const { WeeklyRevenueChart } = await import('./WeeklyRevenueChart')

const DATA = weeklySeries(SALES, periodRange(4, '2026-10-16'))

describe('WeeklyRevenueChart', () => {
  it('draws bars and the takeaway-share line without a recharts config error', () => {
    const { container } = render(
      <WeeklyRevenueChart data={DATA} isLoading={false} error={null} />,
    )
    expect(container.querySelectorAll('.recharts-bar-rectangle').length).toBeGreaterThan(0)
    expect(container.querySelector('.recharts-line')).toBeTruthy()
  })

  it('labels every ISO week in the period on the axis', () => {
    render(<WeeklyRevenueChart data={DATA} isLoading={false} error={null} />)
    expect(screen.getByText('21 Sep')).toBeInTheDocument()
    expect(screen.getByText('12 Oct')).toBeInTheDocument()
  })

  it('carries a right-hand percentage axis for takeaway share', () => {
    render(<WeeklyRevenueChart data={DATA} isLoading={false} error={null} />)
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('shows an empty state rather than axes with no bars', () => {
    render(
      <WeeklyRevenueChart
        data={weeklySeries([], periodRange(4, '2026-10-16'))}
        isLoading={false}
        error={null}
      />,
    )
    expect(screen.getByText('No sales in this period')).toBeInTheDocument()
  })

  it('surfaces an error instead of a blank panel', () => {
    render(<WeeklyRevenueChart data={[]} isLoading={false} error="permission denied" />)
    expect(screen.getByText('permission denied')).toBeInTheDocument()
  })

  it('renders a skeleton while loading', () => {
    const { container } = render(<WeeklyRevenueChart data={[]} isLoading error={null} />)
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })
})
