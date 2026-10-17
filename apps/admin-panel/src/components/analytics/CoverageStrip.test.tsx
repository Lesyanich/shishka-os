import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SALES } from '../../lib/__fixtures__/analytics-prod'
import { periodRange, sumSales } from '../../lib/analytics'
import { CoverageStrip } from './CoverageStrip'

const RANGE = periodRange(4, '2026-10-16')
const TOTALS = sumSales(SALES, RANGE.start, RANGE.end)

describe('CoverageStrip', () => {
  it('reports the window and how much of it actually traded', () => {
    render(
      <CoverageStrip range={RANGE} totals={TOTALS} isLoading={false} onRefresh={() => {}} />,
    )
    expect(screen.getByText('4w · 21 Sep – 16 Oct')).toBeInTheDocument()
    // 21 trading days inside a 26-day window — the gap is the honest part.
    expect(screen.getByText('21 / 26')).toBeInTheDocument()
  })

  it('shows the SQL-verified receipts and gross for the period', () => {
    render(
      <CoverageStrip range={RANGE} totals={TOTALS} isLoading={false} onRefresh={() => {}} />,
    )
    expect(screen.getByText('142')).toBeInTheDocument()
    expect(screen.getByText('฿46,026')).toBeInTheDocument()
  })

  it('says revenue is gross, so refunds are never netted away silently', () => {
    render(
      <CoverageStrip range={RANGE} totals={TOTALS} isLoading={false} onRefresh={() => {}} />,
    )
    expect(screen.getByText(/Revenue is quoted/)).toBeInTheDocument()
    expect(screen.getByText('฿569')).toBeInTheDocument()
  })

  it('hides the refunds fact when there were none', () => {
    render(
      <CoverageStrip
        range={RANGE}
        totals={{ ...TOTALS, refunds: 0 }}
        isLoading={false}
        onRefresh={() => {}}
      />,
    )
    expect(screen.queryByText('Refunds')).not.toBeInTheDocument()
  })

  it('refreshes on demand and is disabled while loading', async () => {
    const onRefresh = vi.fn()
    const { rerender } = render(
      <CoverageStrip range={RANGE} totals={TOTALS} isLoading={false} onRefresh={onRefresh} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /Refresh/ }))
    expect(onRefresh).toHaveBeenCalledTimes(1)

    rerender(<CoverageStrip range={RANGE} totals={TOTALS} isLoading onRefresh={onRefresh} />)
    expect(screen.getByRole('button', { name: /Refresh/ })).toBeDisabled()
  })
})
