import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { COUNT_DAYS } from '../../lib/__fixtures__/analytics-stock-prod'
import { countCoverage } from '../../lib/analyticsStock'
import { StockCoverageStrip } from './StockCoverageStrip'

const COVERAGE = countCoverage(COUNT_DAYS)

function renderStrip(over: Partial<Parameters<typeof StockCoverageStrip>[0]> = {}) {
  return render(
    <StockCoverageStrip
      coverage={COVERAGE}
      daysSinceCount={46}
      wasteEntries={0}
      bomCoveragePct={89.83}
      isLoading={false}
      onRefresh={() => {}}
      {...over}
    />,
  )
}

describe('StockCoverageStrip', () => {
  it('reports the last count, its age and what it covered', () => {
    renderStrip()
    expect(screen.getByText('2026-09-01')).toBeInTheDocument()
    expect(screen.getByText('121')).toBeInTheDocument()
    expect(screen.getByText('23')).toBeInTheDocument()
    // "46 days" shows twice: once as the Age fact, once in the staleness warning.
    expect(screen.getAllByText(/46 days/).length).toBeGreaterThanOrEqual(1)
  })

  it('shows the BOM coverage from the view', () => {
    renderStrip()
    expect(screen.getByText('89.8%')).toBeInTheDocument()
  })

  it('warns that variance needs two count days', () => {
    renderStrip()
    expect(screen.getByText(/Variance needs two count days/)).toBeInTheDocument()
  })

  it('warns that the count is too old to describe today', () => {
    renderStrip()
    expect(screen.getByText(/so the inventory value below describes that day/)).toBeInTheDocument()
  })

  it('warns that no waste is logged, so nothing is deducted for it', () => {
    renderStrip()
    expect(screen.getByText(/No waste has been logged at all/)).toBeInTheDocument()
  })

  it('drops every warning once the data is healthy', () => {
    renderStrip({
      coverage: { ...COVERAGE, countDays: 2, hasInterval: true },
      daysSinceCount: 3,
      wasteEntries: 9,
    })
    expect(screen.queryByText(/Variance needs two count days/)).not.toBeInTheDocument()
    expect(screen.queryByText(/describes that day/)).not.toBeInTheDocument()
    expect(screen.queryByText(/No waste has been logged/)).not.toBeInTheDocument()
  })

  it('says "never" rather than a blank when nothing was ever counted', () => {
    renderStrip({ coverage: countCoverage([]), daysSinceCount: null })
    expect(screen.getByText('never')).toBeInTheDocument()
  })

  it('refreshes on demand', async () => {
    const onRefresh = vi.fn()
    renderStrip({ onRefresh })
    await userEvent.click(screen.getByRole('button', { name: /Refresh/ }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })
})
