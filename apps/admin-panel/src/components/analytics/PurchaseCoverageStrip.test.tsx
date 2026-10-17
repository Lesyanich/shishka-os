import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { COVERAGE } from '../../lib/__fixtures__/analytics-purchases-prod'
import { coverageTotals } from '../../lib/analyticsPurchases'
import { periodRange } from '../../lib/analytics'
import { PurchaseCoverageStrip } from './PurchaseCoverageStrip'

const RANGE = periodRange(8, '2026-10-16')
const TOTALS = coverageTotals(COVERAGE, RANGE)

function renderStrip(props: Partial<Parameters<typeof PurchaseCoverageStrip>[0]> = {}) {
  return render(
    <MemoryRouter>
      <PurchaseCoverageStrip
        range={RANGE}
        totals={TOTALS}
        isLoading={false}
        onRefresh={() => {}}
        {...props}
      />
    </MemoryRouter>,
  )
}

describe('PurchaseCoverageStrip', () => {
  it('shows the period, spend and the SQL-verified canonical share', () => {
    renderStrip()
    expect(screen.getByText('8w · 24 Aug – 16 Oct')).toBeInTheDocument()
    expect(screen.getByText('฿22,985')).toBeInTheDocument()
    expect(screen.getByText('39 of 149')).toBeInTheDocument()
    // 21.2 % appears twice on purpose: once as a fact, once inside the warning.
    expect(screen.getAllByText('21.2%').length).toBeGreaterThanOrEqual(1)
  })

  it('warns loudly that most of the money cannot be attributed', () => {
    renderStrip()
    // The pressure the strip exists to apply — it must not be softened.
    expect(screen.getByText(/of this period/)).toBeInTheDocument()
    expect(screen.getByText(/auto-created stub lines/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'unmatched queue' })).toHaveAttribute(
      'href',
      '/procurement',
    )
  })

  it('says the period figure is not the whole queue', () => {
    renderStrip()
    expect(screen.getByText(/the full queue is larger/)).toBeInTheDocument()
  })

  it('drops the warning once coverage would be trustworthy', () => {
    renderStrip({ totals: { ...TOTALS, canonicalPct: 95 } })
    expect(screen.queryByText(/auto-created stub lines/)).not.toBeInTheDocument()
  })

  it('refreshes on demand and disables while loading', async () => {
    const onRefresh = vi.fn()
    renderStrip({ onRefresh })
    await userEvent.click(screen.getByRole('button', { name: /Refresh/ }))
    expect(onRefresh).toHaveBeenCalledTimes(1)

    renderStrip({ isLoading: true })
    expect(screen.getAllByRole('button', { name: /Refresh/ }).at(-1)).toBeDisabled()
  })
})
