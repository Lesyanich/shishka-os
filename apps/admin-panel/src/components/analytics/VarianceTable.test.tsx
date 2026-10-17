import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { COUNT_DAYS, SYNTHETIC_VARIANCE, VARIANCE } from '../../lib/__fixtures__/analytics-stock-prod'
import { countCoverage, varianceView } from '../../lib/analyticsStock'
import { VarianceTable } from './VarianceTable'

const COVERAGE = countCoverage(COUNT_DAYS)

function renderTable(rows = VARIANCE) {
  const v = varianceView(rows)
  return render(
    <VarianceTable
      rows={v.rows}
      droppedIncomplete={v.droppedIncomplete}
      interval={v.interval}
      coverage={COVERAGE}
      isLoading={false}
    />,
  )
}

describe('VarianceTable — the empty state that is the point', () => {
  it('explains WHY it is empty rather than showing a spinner or a zero', () => {
    renderTable()
    expect(screen.getByText('Waiting on a second stock count')).toBeInTheDocument()
    expect(screen.getByText(/Variance is measured between two counts/)).toBeInTheDocument()
  })

  it('names the one count day prod actually has', () => {
    renderTable()
    expect(screen.getByText('2026-09-01')).toBeInTheDocument()
    expect(screen.getByText(/121 items, 23 of them A-class/)).toBeInTheDocument()
  })

  it('says the missing piece is a floor routine, not a missing feature', () => {
    renderTable()
    expect(screen.getByText(/weekly floor routine/)).toBeInTheDocument()
    expect(screen.getByText(/already built and tested/)).toBeInTheDocument()
  })

  it('renders no table at all while there is no interval', () => {
    const { container } = renderTable()
    expect(container.querySelector('table')).toBeNull()
  })

  it('shows a skeleton while loading, not the empty state', () => {
    const { container } = render(
      <VarianceTable
        rows={[]}
        droppedIncomplete={0}
        interval={null}
        coverage={COVERAGE}
        isLoading
      />,
    )
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
    expect(screen.queryByText('Waiting on a second stock count')).not.toBeInTheDocument()
  })
})

describe('VarianceTable — with an interval (synthetic, so it is tested early)', () => {
  it('renders the full balance as columns', () => {
    const { container } = renderTable(SYNTHETIC_VARIANCE)
    expect(container.querySelector('table')).toBeTruthy()
    for (const header of ['Item', 'Opening', '+ Bought', '− Used', '− Waste', '= Expected', 'Counted', 'Variance', '%']) {
      expect(screen.getByText(header)).toBeInTheDocument()
    }
  })

  it('names the interval it is reporting', () => {
    renderTable(SYNTHETIC_VARIANCE)
    expect(screen.getByText(/2026-09-01 → 2026-09-08/)).toBeInTheDocument()
  })

  it('lists complete rows and excludes the incomplete one', () => {
    const { container } = renderTable(SYNTHETIC_VARIANCE)
    expect(container.querySelectorAll('tbody tr')).toHaveLength(3)
    expect(screen.getByText('Shredded Mozzarella Cheese')).toBeInTheDocument()
    expect(screen.queryByText('Onion')).not.toBeInTheDocument()
  })

  it('says how many rows it left out and why', () => {
    renderTable(SYNTHETIC_VARIANCE)
    expect(screen.getByText(/1 item left out/)).toBeInTheDocument()
    expect(screen.getByText(/really a missing count/)).toBeInTheDocument()
  })

  it('shows a shortage as money out, with the sign the owner expects', () => {
    renderTable(SYNTHETIC_VARIANCE)
    // variance_thb 120 means 120 of stock is missing.
    expect(screen.getByText('−฿120')).toBeInTheDocument()
  })

  it('colours the rows by the spec thresholds', () => {
    const { container } = renderTable(SYNTHETIC_VARIANCE)
    const rows = Array.from(container.querySelectorAll('tbody tr'))
    expect(rows[0].innerHTML).toContain('text-brick-bright')
    expect(rows[1].innerHTML).toContain('text-amber-watch')
    expect(rows[2].innerHTML).toContain('text-cream/80')
  })
})
