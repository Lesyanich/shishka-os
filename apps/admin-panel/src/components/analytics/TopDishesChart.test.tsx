import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ITEMS } from '../../lib/__fixtures__/analytics-prod'
import { aggregateDishes, categoryMix, periodRange } from '../../lib/analytics'

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

const { TopDishesChart, makeCategoryColor } = await import('./TopDishesChart')

const RANGE = periodRange(4, '2026-10-16')
const DISHES = aggregateDishes(ITEMS, RANGE)
const COLOR = makeCategoryColor(categoryMix(DISHES).map((s) => s.name))

describe('TopDishesChart', () => {
  it('lays out exactly ten bars and names them', () => {
    const { container } = render(
      <TopDishesChart dishes={DISHES} categoryColor={COLOR} isLoading={false} />,
    )
    expect(container.querySelectorAll('.recharts-bar-rectangle')).toHaveLength(10)
    // The SQL-verified leader by units for this window.
    expect(screen.getByText('TOAST_CHICKEN_TAWOOK')).toBeInTheDocument()
    expect(screen.getByText('TOAST_KEBAB')).toBeInTheDocument()
  })

  it('opens on units and switches to revenue', async () => {
    render(<TopDishesChart dishes={DISHES} categoryColor={COLOR} isLoading={false} />)
    expect(screen.getByRole('button', { name: 'Units' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(screen.getByRole('button', { name: 'Revenue' }))
    expect(screen.getByRole('button', { name: 'Revenue' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Units' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('reorders the bars when the metric changes', async () => {
    render(<TopDishesChart dishes={DISHES} categoryColor={COLOR} isLoading={false} />)
    // BYO_ADDON_GUACAMOLE makes the top-10 on units (8) but not on revenue (320).
    expect(screen.getByText('BYO_ADDON_GUACAMOLE')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Revenue' }))
    expect(screen.queryByText('BYO_ADDON_GUACAMOLE')).not.toBeInTheDocument()
  })

  it('renders a skeleton while loading, not an empty chart', () => {
    const { container } = render(<TopDishesChart dishes={[]} categoryColor={COLOR} isLoading />)
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('says so when nothing sold', () => {
    render(<TopDishesChart dishes={[]} categoryColor={COLOR} isLoading={false} />)
    expect(screen.getByText('No dishes sold in this period')).toBeInTheDocument()
  })
})

describe('makeCategoryColor', () => {
  it('is stable for a name and shared across widgets', () => {
    const color = makeCategoryColor(['a', 'b', 'c'])
    expect(color('a')).toBe(color('a'))
    expect(color('a')).not.toBe(color('b'))
  })

  it('still returns a colour for a name it has never seen', () => {
    expect(makeCategoryColor(['a'])('unknown')).toBeTruthy()
  })
})
