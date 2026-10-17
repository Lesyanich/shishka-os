import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ITEMS } from '../../lib/__fixtures__/analytics-prod'
import {
  aggregateDishes,
  categoryMix,
  OTHER_SLICE_NAME,
  periodRange,
} from '../../lib/analytics'

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

const { CategoryMixDonut } = await import('./CategoryMixDonut')
const { makeCategoryColor } = await import('./TopDishesChart')

const SLICES = categoryMix(aggregateDishes(ITEMS, periodRange(4, '2026-10-16')))
const COLOR = makeCategoryColor(SLICES.map((s) => s.name))

describe('CategoryMixDonut', () => {
  it('mounts a pie that actually draws', () => {
    const { container } = render(
      <CategoryMixDonut slices={SLICES} categoryColor={COLOR} isLoading={false} />,
    )
    // The exact sector count is not assertable: under jsdom recharts 3.8 draws
    // n-1 sectors with paddingAngle=1 and none at all with paddingAngle=0, so
    // the count reflects the environment, not what a browser paints. The
    // grouping guarantee is tested as pure logic in analytics.test.ts.
    expect(container.querySelector('.recharts-pie')).toBeTruthy()
    expect(container.querySelectorAll('.recharts-pie-sector').length).toBeGreaterThan(0)
  })

  it('lists every section in the legend, including the grouped tail', () => {
    render(<CategoryMixDonut slices={SLICES} categoryColor={COLOR} isLoading={false} />)
    expect(screen.getAllByText('KP-FIN-WRP').length).toBeGreaterThan(0)
    expect(screen.getByText('37.1%')).toBeInTheDocument()
    // The smallest section on prod (0.22 %) — folded into the donut's tail
    // wedge, but it must still be named and quantified for the owner.
    expect(screen.getByText('KP-DRK-TEA')).toBeInTheDocument()
  })

  it('declares that the donut grouped the tail', () => {
    render(<CategoryMixDonut slices={SLICES} categoryColor={COLOR} isLoading={false} />)
    expect(screen.getByText(/donut groups the smallest/)).toBeInTheDocument()
  })

  it('says nothing about grouping when the sections already fit', () => {
    render(
      <CategoryMixDonut slices={SLICES.slice(0, 4)} categoryColor={COLOR} isLoading={false} />,
    )
    expect(screen.queryByText(OTHER_SLICE_NAME)).not.toBeInTheDocument()
    expect(screen.queryByText(/donut groups the smallest/)).not.toBeInTheDocument()
  })

  it('shows the period total in the middle when nothing is hovered', () => {
    render(<CategoryMixDonut slices={SLICES} categoryColor={COLOR} isLoading={false} />)
    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.getByText(`${SLICES.length} sections`)).toBeInTheDocument()
  })

  it('falls back to a message with no slices', () => {
    render(<CategoryMixDonut slices={[]} categoryColor={COLOR} isLoading={false} />)
    expect(screen.getByText('No sales in this period')).toBeInTheDocument()
  })
})
